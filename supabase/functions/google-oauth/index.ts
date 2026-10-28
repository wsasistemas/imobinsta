// google-oauth — conecta o Google Drive da conta (escopo drive.file) para a ponte com o Google Vids (Fase 11).
//
// POST (JWT do dono): { conta_id }               → { url } do consentimento do Google. O front redireciona para ela.
//                     { conta_id, acao: "testar" } → { email } (renova o token e lê o usuário do Drive)
// GET  (retorno do Google, sem JWT): ?code&state → troca o código pelo refresh token, guarda no Vault,
//      marca a conexão como conectada e volta para Conexões.
//
// Publicar com:  supabase functions deploy google-oauth --no-verify-jwt
// (o retorno do Google não traz JWT; o POST valida o JWT aqui dentro).
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
import { admin, CORS, env, json, origemPermitida, papelNaConta, usuario } from "../_shared/comum.ts";
import { acessoGoogle, conexaoGoogle, drive, ErroGoogle, ESCOPO_DRIVE, redirectGoogle, trocarCodigo } from "../_shared/google.ts";

const VALIDADE_ESTADO_MS = 10 * 60 * 1000;
// O mesmo oauth_estados do Instagram; o prefixo impede que um estado de um provedor sirva no outro.
const PREFIXO = "google:";

type Sobre = { user?: { emailAddress?: string; displayName?: string } };

function voltar(retorno: string, params: Record<string, string>) {
  const url = new URL("/conexoes", retorno);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(`google_${k}`, v);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

async function iniciar(req: Request) {
  const db = admin();
  const user = await usuario(req, db);
  if (!user) return json({ erro: "Faça login de novo." }, 401);

  const { conta_id, acao } = await req.json().catch(() => ({}));
  if (typeof conta_id !== "string") return json({ erro: "conta_id ausente" }, 400);
  if ((await papelNaConta(db, conta_id, user.id)) !== "dono") {
    return json({ erro: "Só o dono da conta pode conectar o Google." }, 403);
  }

  if (acao === "testar") {
    const sobre = await drive<Sobre>(await acessoGoogle(db, conta_id), "about", { fields: "user(emailAddress,displayName)" });
    return json({ email: sobre.user?.emailAddress ?? null });
  }

  const origem = req.headers.get("Origin");
  if (!origemPermitida(origem)) return json({ erro: `Origem não permitida: ${origem}` }, 400);
  await conexaoGoogle(db, conta_id); // falha cedo, com mensagem clara, se a migration não rodou

  const estado = PREFIXO + crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
  const { error } = await db.from("oauth_estados").insert({ estado, conta_id, user_id: user.id, retorno: origem });
  if (error) throw error;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", redirectGoogle());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", ESCOPO_DRIVE);
  url.searchParams.set("access_type", "offline"); // devolve o refresh token
  url.searchParams.set("prompt", "consent"); // devolve o refresh token também ao reconectar
  url.searchParams.set("state", estado);
  return json({ url: url.toString() });
}

async function retorno(req: Request) {
  const db = admin();
  const p = new URL(req.url).searchParams;
  const estado = p.get("state") ?? "";
  if (!estado.startsWith(PREFIXO)) return new Response("Pedido de conexão inválido.", { status: 400 });

  const { data: reg } = await db.from("oauth_estados").select("*").eq("estado", estado).maybeSingle();
  if (!reg) return new Response("Pedido de conexão inválido ou já usado. Volte ao estúdio e tente de novo.", { status: 400 });
  await db.from("oauth_estados").delete().eq("estado", estado);

  if (Date.now() - new Date(reg.criado_em).getTime() > VALIDADE_ESTADO_MS) {
    return voltar(reg.retorno, { erro: "O pedido expirou. Tente de novo." });
  }
  if (p.get("error") || !p.get("code")) {
    return voltar(reg.retorno, { erro: p.get("error") === "access_denied" ? "Autorização cancelada no Google." : (p.get("error") ?? "Sem código do Google.") });
  }

  try {
    const t = await trocarCodigo(p.get("code")!);
    if (!t.scope?.split(" ").includes(ESCOPO_DRIVE)) {
      return voltar(reg.retorno, { erro: "O acesso ao Drive não foi marcado na tela do Google. Tente de novo e marque a caixa do Drive." });
    }
    if (!t.refresh_token) throw new ErroGoogle("O Google não devolveu o refresh token.");

    const sobre = await drive<Sobre>(t.access_token, "about", { fields: "user(emailAddress,displayName)" });
    const conexao = await conexaoGoogle(db, reg.conta_id);
    const { error: eVault } = await db.rpc("salvar_segredo_conexao", { p_conexao: conexao.id, p_valor: t.refresh_token });
    if (eVault) throw eVault;

    await db.from("conexoes").update({
      status: "conectado",
      detalhe: `Google Drive · ${sobre.user?.emailAddress ?? "conta Google"}`,
      expira_em: null,
      atualizado_em: new Date().toISOString(),
    }).eq("id", conexao.id);

    return voltar(reg.retorno, { ok: "1" });
  } catch (e) {
    // Erro do Google ou do banco (PostgrestError não é instanceof Error). Nenhum dos dois traz segredo.
    const detalhe = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? JSON.stringify(e));
    const etapa = e instanceof ErroGoogle ? "O Google respondeu" : "Falha ao salvar a conexão";
    console.error("google-oauth retorno:", etapa, detalhe);
    return voltar(reg.retorno, { erro: `${etapa}: ${detalhe}` });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method === "POST") return await iniciar(req);
    if (req.method === "GET") return await retorno(req);
    return json({ erro: "Método não suportado" }, 405);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? "Erro inesperado");
    console.error("google-oauth:", msg);
    return json({ erro: msg }, e instanceof ErroGoogle ? 400 : 500);
  }
});
