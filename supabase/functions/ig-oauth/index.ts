// ig-oauth — conecta a conta do Instagram pelo Facebook Login for Business.
//
// POST (JWT do dono): { conta_id } → { url } do diálogo da Meta. O front redireciona para ela.
// GET  (retorno da Meta, sem JWT): ?code&state → troca o código pelo token de 60 dias,
//      guarda no Vault, marca a conexão como conectada e volta para o estúdio.
//
// Publicar com:  supabase functions deploy ig-oauth --no-verify-jwt
// (o retorno da Meta não traz JWT; o POST valida o JWT aqui dentro).
// Secrets: META_APP_ID, META_APP_SECRET, META_CONFIG_ID. Opcional: APP_ORIGENS (lista separada por vírgula).
import { admin, conexaoInstagram, CORS, env, graph, json, papelNaConta, usuario } from "../_shared/comum.ts";

const VALIDADE_ESTADO_MS = 10 * 60 * 1000;

function redirectUri() {
  return `${env("SUPABASE_URL")}/functions/v1/ig-oauth`;
}

/** Só volta para origens do próprio estúdio (evita redirecionamento aberto). */
function origemPermitida(origem: string | null): origem is string {
  if (!origem) return false;
  const extras = (Deno.env.get("APP_ORIGENS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  return (
    extras.includes(origem) ||
    /^https:\/\/imobinsta(-[a-z0-9-]+)?\.vercel\.app$/.test(origem) ||
    /^http:\/\/localhost:\d+$/.test(origem)
  );
}

function voltar(retorno: string, params: Record<string, string>) {
  const url = new URL("/conexoes/instagram", retorno);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

async function iniciar(req: Request) {
  const db = admin();
  const user = await usuario(req, db);
  if (!user) return json({ erro: "Faça login de novo." }, 401);

  const { conta_id } = await req.json().catch(() => ({}));
  if (typeof conta_id !== "string") return json({ erro: "conta_id ausente" }, 400);
  if ((await papelNaConta(db, conta_id, user.id)) !== "dono") {
    return json({ erro: "Só o dono da conta pode conectar o Instagram." }, 403);
  }

  const origem = req.headers.get("Origin");
  if (!origemPermitida(origem)) return json({ erro: `Origem não permitida: ${origem}` }, 400);

  const estado = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
  const { error } = await db.from("oauth_estados").insert({ estado, conta_id, user_id: user.id, retorno: origem });
  if (error) throw error;

  const url = new URL("https://www.facebook.com/v25.0/dialog/oauth");
  url.searchParams.set("client_id", env("META_APP_ID"));
  url.searchParams.set("config_id", env("META_CONFIG_ID"));
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("override_default_response_type", "true");
  url.searchParams.set("state", estado);
  return json({ url: url.toString() });
}

type Pagina = { id: string; name: string; instagram_business_account?: { id: string; username?: string } };

async function retorno(req: Request) {
  const db = admin();
  const p = new URL(req.url).searchParams;
  const estado = p.get("state") ?? "";

  const { data: reg } = await db.from("oauth_estados").select("*").eq("estado", estado).maybeSingle();
  if (!reg) return new Response("Pedido de conexão inválido ou já usado. Volte ao estúdio e tente de novo.", { status: 400 });
  await db.from("oauth_estados").delete().eq("estado", estado);

  if (Date.now() - new Date(reg.criado_em).getTime() > VALIDADE_ESTADO_MS) {
    return voltar(reg.retorno, { erro: "O pedido expirou. Tente de novo." });
  }
  if (p.get("error") || !p.get("code")) {
    return voltar(reg.retorno, { erro: p.get("error_description") ?? "Autorização cancelada na Meta." });
  }

  try {
    // 1. Código → token curto → token longo (60 dias).
    const curto = await graph<{ access_token: string }>("oauth/access_token", {
      client_id: env("META_APP_ID"),
      client_secret: env("META_APP_SECRET"),
      redirect_uri: redirectUri(),
      code: p.get("code")!,
    });
    const longo = await graph<{ access_token: string; expires_in?: number }>("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: env("META_APP_ID"),
      client_secret: env("META_APP_SECRET"),
      fb_exchange_token: curto.access_token,
    });

    // 2. Página com Instagram profissional. Prefere a que já está na conta.
    const { data: paginas } = await graph<{ data: Pagina[] }>("me/accounts", {
      fields: "id,name,instagram_business_account{id,username}",
      access_token: longo.access_token,
    });
    const { data: conta } = await db.from("contas").select("ig_user_id").eq("id", reg.conta_id).single();
    const comIg = paginas.filter((pg) => pg.instagram_business_account);
    const pagina = comIg.find((pg) => pg.instagram_business_account!.id === conta?.ig_user_id) ?? comIg[0];
    if (!pagina) {
      return voltar(reg.retorno, {
        erro: "Nenhuma Página com Instagram profissional foi autorizada. Marque a Página e a @wsasistemas.ia na tela da Meta.",
      });
    }
    const ig = pagina.instagram_business_account!;

    // 3. Token no Vault; status e conta atualizados.
    const conexao = await conexaoInstagram(db, reg.conta_id);
    const { error: eVault } = await db.rpc("salvar_segredo_conexao", { p_conexao: conexao.id, p_valor: longo.access_token });
    if (eVault) throw eVault;

    const expira = new Date(Date.now() + (longo.expires_in ?? 60 * 24 * 3600) * 1000).toISOString();
    await db.from("conexoes").update({
      status: "conectado",
      detalhe: `@${ig.username ?? "?"} · Página ${pagina.name}`,
      expira_em: expira,
      atualizado_em: new Date().toISOString(),
    }).eq("id", conexao.id);
    await db.from("contas").update({
      ig_user_id: ig.id,
      ig_username: ig.username ?? null,
      atualizado_em: new Date().toISOString(),
    }).eq("id", reg.conta_id);

    return voltar(reg.retorno, { ok: "1" });
  } catch (e) {
    console.error("ig-oauth retorno:", e instanceof Error ? e.message : e);
    return voltar(reg.retorno, { erro: "A Meta recusou a conexão. Confira as etapas do guia e tente de novo." });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method === "POST") return await iniciar(req);
    if (req.method === "GET") return await retorno(req);
    return json({ erro: "Método não suportado" }, 405);
  } catch (e) {
    console.error("ig-oauth:", e instanceof Error ? e.message : e);
    return json({ erro: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});
