// ig-sync — importa posts publicados, métricas por post e números da conta.
//
// POST { conta_id } com JWT de um membro (botão "Sincronizar"), ou
// POST {}          com a service_role (pg_cron diário): sincroniza todas as contas conectadas.
// Somente leitura na Meta: não publica, não comenta, não altera nada na conta.
import { admin, conexaoInstagram, CORS, type Db, ehServico, ErroGraph, graph, json, papelNaConta, usuario } from "../_shared/comum.ts";

const MAX_POSTS = 100;

type Midia = {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_product_type?: "FEED" | "REELS" | "STORY" | "AD";
  permalink?: string;
  timestamp: string;
  media_url?: string;
  thumbnail_url?: string;
  like_count?: number;
  comments_count?: number;
};
type Insight = { name: string; values?: { value: number }[]; total_value?: { value: number } };

function formato(m: Midia) {
  if (m.media_product_type === "REELS") return "reels";
  if (m.media_type === "CAROUSEL_ALBUM") return "carrossel";
  return "post";
}

function valor(insights: Insight[], nome: string): number | null {
  const i = insights.find((x) => x.name === nome);
  return i?.total_value?.value ?? i?.values?.at(-1)?.value ?? null;
}

/** Nem toda métrica vale para todo tipo de mídia; se o conjunto completo falhar, tenta o básico. */
async function insightsDaMidia(id: string, token: string): Promise<Insight[]> {
  for (const metric of ["reach,saved,shares,views", "reach,saved"]) {
    try {
      return (await graph<{ data: Insight[] }>(`${id}/insights`, { metric, access_token: token })).data;
    } catch (e) {
      if (e instanceof ErroGraph && e.tokenInvalido) throw e;
    }
  }
  return [];
}

async function sincronizarConta(db: Db, contaId: string) {
  const conexao = await conexaoInstagram(db, contaId);
  const { data: token, error: eTok } = await db.rpc("ler_segredo_conexao", { p_conexao: conexao.id });
  if (eTok) throw eTok;
  if (!token) return { conta_id: contaId, erro: "Instagram ainda não conectado." };

  const { data: conta } = await db.from("contas").select("ig_user_id").eq("id", contaId).single();
  const igId = conta?.ig_user_id as string | undefined;
  if (!igId) return { conta_id: contaId, erro: "Conta sem ig_user_id." };

  const hoje = new Date().toISOString().slice(0, 10);
  try {
    // 1. Perfil e alcance do dia.
    const perfil = await graph<{ followers_count?: number; follows_count?: number; media_count?: number; username?: string }>(
      igId,
      { fields: "username,followers_count,follows_count,media_count", access_token: token },
    );
    let alcance: number | null = null;
    try {
      const r = await graph<{ data: Insight[] }>(`${igId}/insights`, {
        metric: "reach", period: "day", metric_type: "total_value", access_token: token,
      });
      alcance = valor(r.data, "reach");
    } catch (e) {
      if (e instanceof ErroGraph && e.tokenInvalido) throw e;
    }
    await db.from("metricas_conta").upsert({
      conta_id: contaId, data: hoje,
      seguidores: perfil.followers_count ?? null, seguindo: perfil.follows_count ?? null,
      total_posts: perfil.media_count ?? null, alcance, coletado_em: new Date().toISOString(),
    });

    // 2. Posts (paginado até MAX_POSTS).
    const midias: Midia[] = [];
    let pagina: { data: Midia[]; paging?: { next?: string } } | null = await graph(`${igId}/media`, {
      fields: "id,caption,media_type,media_product_type,permalink,timestamp,media_url,thumbnail_url,like_count,comments_count",
      limit: "50",
      access_token: token,
    });
    while (pagina) {
      midias.push(...pagina.data);
      const prox: string | undefined = pagina.paging?.next;
      pagina = prox && midias.length < MAX_POSTS ? await graph(prox, {}) : null;
    }

    // 3. Upsert de cada post e retrato do dia das métricas.
    for (const m of midias.slice(0, MAX_POSTS)) {
      const { data: post, error } = await db.from("posts").upsert({
        conta_id: contaId, ig_media_id: m.id, formato: formato(m), status: "publicado",
        legenda: m.caption ?? null, permalink: m.permalink ?? null,
        capa_url: m.thumbnail_url ?? m.media_url ?? null, publicado_em: m.timestamp,
        curtidas: m.like_count ?? null, comentarios: m.comments_count ?? null,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: "conta_id,ig_media_id" }).select("id").single();
      if (error) throw error;

      const ins = await insightsDaMidia(m.id, token);
      await db.from("metricas_post").upsert({
        post_id: post.id, data: hoje,
        alcance: valor(ins, "reach"), views: valor(ins, "views"),
        curtidas: m.like_count ?? null, comentarios: m.comments_count ?? null,
        salvamentos: valor(ins, "saved"), compartilhamentos: valor(ins, "shares"),
        coletado_em: new Date().toISOString(),
      });
    }

    await db.from("conexoes").update({
      detalhe: `@${perfil.username ?? "?"} · ${midias.length} posts sincronizados em ${hoje.split("-").reverse().join("/")}`,
      atualizado_em: new Date().toISOString(),
    }).eq("id", conexao.id);
    return { conta_id: contaId, posts: midias.length, seguidores: perfil.followers_count ?? null };
  } catch (e) {
    if (e instanceof ErroGraph && e.tokenInvalido) {
      await db.from("conexoes").update({
        status: "expirado", detalhe: "Token da Meta expirou ou foi revogado. Conecte de novo.",
        atualizado_em: new Date().toISOString(),
      }).eq("id", conexao.id);
      return { conta_id: contaId, erro: "Token expirado. Conecte o Instagram de novo." };
    }
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST" }, 405);
  try {
    const db = admin();
    const { conta_id } = await req.json().catch(() => ({}));

    if (ehServico(req)) {
      const { data } = await db.from("conexoes").select("conta_id").eq("provedor", "instagram").eq("status", "conectado");
      const ids = conta_id ? [conta_id as string] : (data ?? []).map((c) => c.conta_id as string);
      const resultados = [];
      for (const id of ids) resultados.push(await sincronizarConta(db, id));
      return json({ resultados });
    }

    const user = await usuario(req, db);
    if (!user) return json({ erro: "Faça login de novo." }, 401);
    if (typeof conta_id !== "string") return json({ erro: "conta_id ausente" }, 400);
    if (!(await papelNaConta(db, conta_id, user.id))) return json({ erro: "Sem acesso a esta conta." }, 403);

    const r = await sincronizarConta(db, conta_id);
    return json(r, "erro" in r ? 409 : 200);
  } catch (e) {
    console.error("ig-sync:", e instanceof Error ? e.message : e);
    return json({ erro: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});
