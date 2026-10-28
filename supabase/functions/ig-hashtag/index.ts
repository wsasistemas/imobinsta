// ig-hashtag — Radar de prospecção (Fase 9): busca oficial por hashtag e guarda as oportunidades.
//
// POST { conta_id, hashtag_id? } com JWT de um membro (botão "Buscar agora"; sem hashtag_id = todas as ativas), ou
// POST {}                       com o cabeçalho x-cron-segredo (pg_cron semanal): todas as contas conectadas.
//
// Publicar com:  supabase functions deploy ig-hashtag --no-verify-jwt
// (o pg_cron chama sem JWT; as duas portas são conferidas aqui dentro).
// Somente leitura na Meta: não comenta, não curte, não manda DM. A IA lê depois (ia-texto, ação "radar").
// A API de hashtag não informa o autor do post: guardamos só permalink, legenda e números.
import { admin, conexaoInstagram, CORS, type Db, ErroGraph, graph, json, papelNaConta, usuario } from "../_shared/comum.ts";

const POR_HASHTAG = 25; // oportunidades novas por hashtag em cada busca
const MIN_LEGENDA = 30; // legenda curta não dá para ler dor

type Hashtag = { id: string; hashtag: string; ig_hashtag_id: string | null };
type Midia = {
  id: string; caption?: string; permalink?: string; media_type?: string; timestamp?: string;
  like_count?: number; comments_count?: number;
};

/** Erro da Meta em português. Os códigos 10/200 aparecem quando falta o recurso Instagram Public Content Access. */
function mensagem(e: unknown) {
  if (e instanceof ErroGraph) {
    if (e.tokenInvalido) return "Token da Meta expirou. Conecte o Instagram de novo.";
    if (e.codigo === 10 || e.codigo === 200 || /public content|permission/i.test(e.message)) {
      return `A Meta não liberou a busca por hashtag para este app (recurso Instagram Public Content Access). ${e.message}`;
    }
    if (e.codigo === 24 || /30 unique hashtags|limit/i.test(e.message)) return "Limite da Meta: 30 hashtags diferentes por semana.";
    return e.message;
  }
  return e instanceof Error ? e.message : "Erro inesperado";
}

async function buscarHashtag(db: Db, contaId: string, igId: string, token: string, h: Hashtag, proprios: Set<string>) {
  let igHashtag = h.ig_hashtag_id;
  if (!igHashtag) {
    const r = await graph<{ data: { id: string }[] }>("ig_hashtag_search", { user_id: igId, q: h.hashtag, access_token: token });
    igHashtag = r.data[0]?.id ?? null;
    if (!igHashtag) throw new Error("A Meta não encontrou esta hashtag.");
    await db.from("radar_hashtags").update({ ig_hashtag_id: igHashtag }).eq("id", h.id);
  }

  const campos = "id,caption,permalink,media_type,timestamp,like_count,comments_count";
  const vistos = new Map<string, Midia>();
  // top_media = mais populares; recent_media = últimas 24 h. Juntas, sem repetir.
  for (const aresta of ["top_media", "recent_media"]) {
    const r = await graph<{ data: Midia[] }>(`${igHashtag}/${aresta}`, { user_id: igId, fields: campos, limit: "50", access_token: token });
    for (const m of r.data ?? []) vistos.set(m.id, m);
  }

  const linhas = [...vistos.values()]
    .filter((m) => !proprios.has(m.id) && (m.caption ?? "").trim().length >= MIN_LEGENDA)
    .slice(0, POR_HASHTAG)
    .map((m) => ({
      conta_id: contaId, hashtag_id: h.id, hashtag: h.hashtag, ig_media_id: m.id, permalink: m.permalink ?? null,
      legenda: (m.caption ?? "").slice(0, 2200), tipo_midia: m.media_type ?? null, publicado_em: m.timestamp ?? null,
      curtidas: m.like_count ?? null, comentarios: m.comments_count ?? null,
    }));
  // Já visto (inclusive descartado) não volta: ignora conflito em (conta_id, ig_media_id).
  const { data, error } = linhas.length
    ? await db.from("radar_oportunidades").upsert(linhas, { onConflict: "conta_id,ig_media_id", ignoreDuplicates: true }).select("id")
    : { data: [], error: null };
  if (error) throw error;
  return data?.length ?? 0;
}

async function buscarConta(db: Db, contaId: string, hashtagId?: string) {
  const conexao = await conexaoInstagram(db, contaId);
  if (conexao.status !== "conectado") return { conta_id: contaId, erro: "Instagram não conectado." };
  const { data: token, error: eTok } = await db.rpc("ler_segredo_conexao", { p_conexao: conexao.id });
  if (eTok) throw eTok;
  const { data: conta } = await db.from("contas").select("ig_user_id").eq("id", contaId).single();
  const igId = conta?.ig_user_id as string | undefined;
  if (!token || !igId) return { conta_id: contaId, erro: "Instagram ainda não conectado." };

  let q = db.from("radar_hashtags").select("id, hashtag, ig_hashtag_id").eq("conta_id", contaId).eq("ativa", true);
  if (hashtagId) q = q.eq("id", hashtagId);
  const { data: hashtags, error } = await q;
  if (error) throw error;
  if (!hashtags?.length) return { conta_id: contaId, erro: "Nenhuma hashtag ativa." };

  // Posts da própria conta não viram oportunidade.
  const { data: meus } = await db.from("posts").select("ig_media_id").eq("conta_id", contaId).not("ig_media_id", "is", null);
  const proprios = new Set((meus ?? []).map((p) => p.ig_media_id as string));

  const resultados: { hashtag: string; novas?: number; erro?: string }[] = [];
  for (const h of hashtags as Hashtag[]) {
    try {
      const novas = await buscarHashtag(db, contaId, igId, token, h, proprios);
      await db.from("radar_hashtags").update({ ultima_busca: new Date().toISOString(), ultimo_erro: null }).eq("id", h.id);
      resultados.push({ hashtag: h.hashtag, novas });
    } catch (e) {
      const msg = mensagem(e).slice(0, 400);
      await db.from("radar_hashtags").update({ ultima_busca: new Date().toISOString(), ultimo_erro: msg }).eq("id", h.id);
      resultados.push({ hashtag: h.hashtag, erro: msg });
      if (e instanceof ErroGraph && e.tokenInvalido) {
        await db.from("conexoes").update({
          status: "expirado", detalhe: "Token da Meta expirou ou foi revogado. Conecte de novo.", atualizado_em: new Date().toISOString(),
        }).eq("id", conexao.id);
        break;
      }
    }
  }
  return { conta_id: contaId, novas: resultados.reduce((s, r) => s + (r.novas ?? 0), 0), resultados };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST" }, 405);
  try {
    const db = admin();
    const { conta_id, hashtag_id } = await req.json().catch(() => ({}));

    const segredo = req.headers.get("x-cron-segredo") ?? "";
    if (segredo) {
      const { data: ok } = await db.rpc("sync_cron_confere", { p_segredo: segredo });
      if (ok !== true) return json({ erro: "Agendador não autorizado." }, 401);
      const { data } = await db.from("conexoes").select("conta_id").eq("provedor", "instagram").eq("status", "conectado");
      const resultados = [];
      for (const c of data ?? []) resultados.push(await buscarConta(db, c.conta_id as string));
      return json({ resultados });
    }

    const user = await usuario(req, db);
    if (!user) return json({ erro: "Faça login de novo." }, 401);
    if (typeof conta_id !== "string") return json({ erro: "conta_id ausente" }, 400);
    if (!(await papelNaConta(db, conta_id, user.id))) return json({ erro: "Sem acesso a esta conta." }, 403);

    const r = await buscarConta(db, conta_id, typeof hashtag_id === "string" ? hashtag_id : undefined);
    return json(r, "erro" in r && !("resultados" in r) ? 409 : 200);
  } catch (e) {
    console.error("ig-hashtag:", e instanceof Error ? e.message : e);
    return json({ erro: mensagem(e) }, 500);
  }
});
