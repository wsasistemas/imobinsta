// ia-imagem — imagem gerada por IA (OpenAI GPT Image ou fal.ai), com teto mensal de gasto (Fase 7).
//
// POST { acao, conta_id, ... } com JWT de um membro da conta:
//   chave  { provedor: openai|heygen|fal, chave }  (só o dono) → { ok, testada }  guarda no Vault
//   uso    {}                                       → { gasto_usd, teto_usd, confirmar_acima_usd, provedor_imagem }
//   gerar  { prompt, qualidade?, confirmar? }       → { midia_id, storage_path, custo_usd, gasto_usd }
//
// Regras (PRD R10/R12): bloqueia quando o gasto do mês + a estimativa passa do teto; acima de
// confirmar_acima_usd por geração devolve 409 { precisa_confirmar } e só gera com confirmar: true.
// Toda chamada fica em geracoes_ia com o custo. A imagem vai para o banco de mídias (pasta "IA").
// Publicar com:  supabase functions deploy ia-imagem
import { z } from "npm:zod@3.25.76";
import { admin, CORS, type Db, json, papelNaConta, usuario } from "../_shared/comum.ts";

const BUCKET = "imobinsta-midias";
const MODELO_OPENAI = Deno.env.get("OPENAI_MODELO_IMAGEM") ?? "gpt-image-1";
const MODELO_FAL = Deno.env.get("FAL_MODELO_IMAGEM") ?? "fal-ai/flux-pro/v1.1";

// Estimativas em US$ por imagem retrato (consultar a tabela de preços do provedor; o custo real
// da OpenAI é recalculado pelos tokens devolvidos). fal.ai cobra por megapixel: 1080×1350 ≈ 1,46 MP.
const ESTIMATIVA = { openai: { low: 0.016, medium: 0.063, high: 0.25 }, fal: 0.06 } as const;
// gpt-image-1: US$ 5 por 1M tokens de texto na entrada e US$ 40 por 1M tokens de imagem na saída.
const PRECO_TOKEN = { entrada: 5 / 1e6, saida: 40 / 1e6 };

const ESTILO = `Foto realista para um post de Instagram da WSA Sistemas de IA (empresa brasileira de sistemas com IA para empresas).
Formato retrato 4:5. Iluminação natural, aparência de foto profissional, sem aspecto de ilustração.
NÃO escreva nenhum texto, letra, número, logotipo ou marca d'água na imagem: o título e o logo entram depois, por cima.
Deixe área limpa (céu, parede, fundo desfocado) no terço inferior para o texto.`;

class ErroUsuario extends Error {
  constructor(mensagem: string, public status = 400, public extra: Record<string, unknown> = {}) {
    super(mensagem);
  }
}

type Provedor = "openai" | "heygen" | "fal";

async function conexao(db: Db, contaId: string, provedor: Provedor) {
  const { data, error } = await db.from("conexoes").select("id, status").eq("conta_id", contaId).eq("provedor", provedor).maybeSingle();
  if (error) throw error;
  return data as { id: string; status: string } | null;
}

async function chaveDo(db: Db, contaId: string, provedor: Provedor) {
  const c = await conexao(db, contaId, provedor);
  if (c) {
    const { data } = await db.rpc("ler_segredo_conexao", { p_conexao: c.id });
    if (data) return data as string;
  }
  const nome = provedor === "openai" ? "OpenAI" : provedor === "fal" ? "fal.ai" : "HeyGen";
  throw new ErroUsuario(`${nome} não conectado. Cole a chave em Conexões e custos.`, 409);
}

async function config(db: Db, contaId: string) {
  const { data } = await db.from("config_ia").select("teto_mensal_usd, confirmar_acima_usd, provedor_imagem").eq("conta_id", contaId).maybeSingle();
  return {
    teto: Number(data?.teto_mensal_usd ?? 30),
    confirmarAcima: Number(data?.confirmar_acima_usd ?? 2),
    provedor: (data?.provedor_imagem ?? "openai") as "openai" | "fal",
  };
}

async function gastoMes(db: Db, contaId: string) {
  const { data, error } = await db.rpc("gasto_ia_mes", { p_conta: contaId });
  if (error) throw error;
  return Number(data ?? 0);
}

// ---------- Chaves ---------------------------------------------------------------------------

/** Testa a chave quando o provedor tem um endpoint simples de leitura. */
async function testar(provedor: Provedor, chave: string) {
  if (provedor === "openai") {
    const r = await fetch("https://api.openai.com/v1/models?limit=1", { headers: { Authorization: `Bearer ${chave}` } });
    if (r.status === 401) throw new ErroUsuario("A OpenAI recusou esta chave. Gere outra em platform.openai.com/api-keys.");
    return r.ok;
  }
  if (provedor === "heygen") {
    const r = await fetch("https://api.heygen.com/v2/user/remaining_quota", { headers: { "X-Api-Key": chave } });
    if (r.status === 401 || r.status === 403) throw new ErroUsuario("A HeyGen recusou esta chave.");
    return r.ok;
  }
  return false; // fal.ai: sem endpoint gratuito de teste; a chave é validada na primeira geração
}

async function acaoChave(db: Db, contaId: string, userId: string, corpo: Record<string, unknown>) {
  if ((await papelNaConta(db, contaId, userId)) !== "dono") throw new ErroUsuario("Só o dono da conta pode trocar chaves.", 403);
  const provedor = z.enum(["openai", "heygen", "fal"]).parse(corpo.provedor);
  const chave = z.string().trim().min(16).max(300).parse(corpo.chave);
  const testada = await testar(provedor, chave);

  let id = (await conexao(db, contaId, provedor))?.id;
  if (!id) {
    const { data, error } = await db.from("conexoes").insert({ conta_id: contaId, provedor }).select("id").single();
    if (error) throw error;
    id = data.id as string;
  }
  const { error: eSeg } = await db.rpc("salvar_segredo_conexao", { p_conexao: id, p_valor: chave });
  if (eSeg) throw eSeg;
  const uso = provedor === "heygen" ? "Vídeo com avatar" : "Imagens por IA";
  const { error } = await db.from("conexoes").update({
    status: "conectado", detalhe: `${uso} · pago por uso${testada ? "" : " · chave salva (testada na primeira geração)"}`,
    atualizado_em: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;
  return { ok: true, testada };
}

// ---------- Geração --------------------------------------------------------------------------

async function gerarOpenai(chave: string, prompt: string, qualidade: "low" | "medium" | "high") {
  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELO_OPENAI, prompt, size: "1024x1536", quality: qualidade, n: 1, output_format: "jpeg" }),
    signal: AbortSignal.timeout(140_000),
  });
  const corpo = await resp.json().catch(() => ({}));
  if (resp.status === 401) throw new ErroUsuario("A OpenAI recusou a chave. Troque em Conexões e custos.", 409);
  if (resp.status === 429) throw new ErroUsuario("Limite ou saldo da OpenAI esgotado. Confira o billing em platform.openai.com.", 429);
  if (!resp.ok) throw new ErroUsuario(`A OpenAI recusou: ${corpo?.error?.message ?? resp.status}`, 422);
  const b64 = corpo?.data?.[0]?.b64_json as string | undefined;
  if (!b64) throw new Error("A OpenAI não devolveu a imagem.");
  const u = corpo?.usage as { input_tokens?: number; output_tokens?: number } | undefined;
  const custo = u?.output_tokens != null
    ? (u.input_tokens ?? 0) * PRECO_TOKEN.entrada + u.output_tokens * PRECO_TOKEN.saida
    : ESTIMATIVA.openai[qualidade];
  return { bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), custo, modelo: MODELO_OPENAI, entrada: u?.input_tokens, saida: u?.output_tokens };
}

async function gerarFal(chave: string, prompt: string) {
  const resp = await fetch(`https://fal.run/${MODELO_FAL}`, {
    method: "POST",
    headers: { Authorization: `Key ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_size: { width: 1080, height: 1350 }, num_images: 1, output_format: "jpeg", enable_safety_checker: true }),
    signal: AbortSignal.timeout(140_000),
  });
  const corpo = await resp.json().catch(() => ({}));
  if (resp.status === 401 || resp.status === 403) throw new ErroUsuario("A fal.ai recusou a chave. Troque em Conexões e custos.", 409);
  if (!resp.ok) throw new ErroUsuario(`A fal.ai recusou: ${corpo?.detail ?? corpo?.error ?? resp.status}`, 422);
  const url = corpo?.images?.[0]?.url as string | undefined;
  if (!url) throw new Error("A fal.ai não devolveu a imagem.");
  const img = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!img.ok) throw new Error(`Não foi possível baixar a imagem da fal.ai (${img.status}).`);
  return { bytes: new Uint8Array(await img.arrayBuffer()), custo: ESTIMATIVA.fal, modelo: MODELO_FAL, entrada: undefined, saida: undefined };
}

async function acaoGerar(db: Db, contaId: string, userId: string, corpo: Record<string, unknown>) {
  const pedido = z.string().trim().min(10).max(2000).parse(corpo.prompt);
  const qualidade = z.enum(["low", "medium", "high"]).default("medium").parse(corpo.qualidade ?? undefined);
  const confirmar = corpo.confirmar === true;
  const cfg = await config(db, contaId);
  const estimativa = cfg.provedor === "openai" ? ESTIMATIVA.openai[qualidade] : ESTIMATIVA.fal;
  const gasto = await gastoMes(db, contaId);

  if (gasto + estimativa > cfg.teto) {
    throw new ErroUsuario(
      `Teto do mês atingido: US$ ${gasto.toFixed(2)} de US$ ${cfg.teto.toFixed(2)}. Aumente o teto em Conexões e custos ou espere o próximo mês.`,
      402, { gasto_usd: gasto, teto_usd: cfg.teto },
    );
  }
  if (estimativa > cfg.confirmarAcima && !confirmar) {
    throw new ErroUsuario(`Esta geração custa cerca de US$ ${estimativa.toFixed(2)}. Confirme para continuar.`, 409, {
      precisa_confirmar: true, custo_estimado_usd: estimativa,
    });
  }

  const chave = await chaveDo(db, contaId, cfg.provedor);
  const prompt = `${ESTILO}\n\nCena: ${pedido}`;
  const registro = { conta_id: contaId, provedor: cfg.provedor, tipo: "imagem", acao: "gerar", criado_por: userId };
  let r: Awaited<ReturnType<typeof gerarOpenai>>;
  try {
    r = cfg.provedor === "openai" ? await gerarOpenai(chave, prompt, qualidade) : await gerarFal(chave, prompt);
  } catch (e) {
    await db.from("geracoes_ia").insert({ ...registro, modelo: cfg.provedor === "openai" ? MODELO_OPENAI : MODELO_FAL, status: "erro", erro: String((e as Error).message).slice(0, 300), custo_usd: 0 });
    throw e;
  }

  const caminho = `${contaId}/IA/${crypto.randomUUID()}.jpg`;
  const { error: eUp } = await db.storage.from(BUCKET).upload(caminho, r.bytes, { contentType: "image/jpeg" });
  if (eUp) throw new Error(`Não foi possível guardar a imagem: ${eUp.message}`);
  const { data: midia, error: eMid } = await db.from("midias").insert({
    conta_id: contaId, pasta: "IA", tipo: "imagem", nome: pedido.slice(0, 80), storage_path: caminho, mime: "image/jpeg",
    tamanho_bytes: r.bytes.length, origem: "ia", criado_por: userId,
  }).select("id").single();
  if (eMid) throw eMid;
  await db.from("geracoes_ia").insert({
    ...registro, modelo: r.modelo, tokens_entrada: r.entrada ?? null, tokens_saida: r.saida ?? null, custo_usd: Number(r.custo.toFixed(4)), status: "ok",
  });
  return { midia_id: midia.id, storage_path: caminho, custo_usd: r.custo, gasto_usd: gasto + r.custo, teto_usd: cfg.teto };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST." }, 405);
  const db = admin();
  try {
    const user = await usuario(req, db);
    if (!user) return json({ erro: "Faça login de novo." }, 401);
    const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const contaId = corpo.conta_id;
    if (typeof contaId !== "string") return json({ erro: "conta_id ausente" }, 400);
    if (!(await papelNaConta(db, contaId, user.id))) return json({ erro: "Sem acesso a esta conta." }, 403);

    switch (corpo.acao) {
      case "chave":
        return json(await acaoChave(db, contaId, user.id, corpo));
      case "uso": {
        const cfg = await config(db, contaId);
        return json({ gasto_usd: await gastoMes(db, contaId), teto_usd: cfg.teto, confirmar_acima_usd: cfg.confirmarAcima, provedor_imagem: cfg.provedor });
      }
      case "gerar":
        return json(await acaoGerar(db, contaId, user.id, corpo));
      default:
        return json({ erro: "Ação desconhecida." }, 400);
    }
  } catch (e) {
    if (e instanceof ErroUsuario) return json({ erro: e.message, ...e.extra }, e.status);
    if (e instanceof z.ZodError) return json({ erro: `Dados inválidos: ${e.issues[0]?.path.join(".")} ${e.issues[0]?.message}` }, 400);
    console.error("ia-imagem", e instanceof Error ? e.message : e);
    return json({ erro: "Falha inesperada na geração de imagem. Tente de novo." }, 500);
  }
});
