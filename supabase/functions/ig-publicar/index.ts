// ig-publicar — publica post único e carrossel no Instagram pela API oficial (containers → media_publish).
//
// Formatos: post único (JPEG), carrossel (JPEG e, desde a Fase 12, vídeos MP4/MOV do Banco) e Reels (MP4 do banco de mídias; o container de vídeo pode
// levar minutos: se não ficar pronto em ~1 min, o post fica "publicando" e a fila do pg_cron termina).
// POST com JWT de um membro da conta:
//   { acao: "publicar", conta_id, post_id }            → publica agora
//   { acao: "agendar",  conta_id, post_id, quando }    → status agendado (a fila publica na hora)
//   { acao: "rascunho", conta_id, post_id }            → cancela o agendamento ou volta um post com erro
// POST { acao: "fila" } com o cabeçalho x-cron-segredo (pg_cron a cada 5 min): publica os agendados vencidos.
// Depois de publicar, se o post pediu automação, ela é criada no Chatfyre pausada e com o media_id (_shared/automacao.ts).
//
// As imagens são os JPEG do post (a Meta só aceita JPEG), gerados no navegador e guardados no bucket
// privado. Na hora de publicar são copiados para o bucket público (a Meta baixa por URL) e apagados depois.
// Publicar com:  supabase functions deploy ig-publicar --no-verify-jwt
// (o pg_cron chama sem JWT; as duas portas são conferidas aqui dentro).
import { z } from "npm:zod@3.25.76";
import { admin, conexaoInstagram, CORS, type Db, ErroGraph, graph, graphPost, json, papelNaConta, usuario } from "../_shared/comum.ts";
import { criarAutomacaoDoPost } from "../_shared/automacao.ts";

const PRIVADO = "imobinsta-midias";
const PUBLICO = "imobinsta-publicados";
const LOTE_FILA = 5;

class ErroUsuario extends Error {
  constructor(mensagem: string, public status = 400) {
    super(mensagem);
  }
}

type Post = {
  id: string; conta_id: string; formato: string; legenda: string | null; status: string;
  video_midia_id: string | null; ig_container_id: string | null;
};
type Slide = { ordem: number; midia_id: string | null; midias: { storage_path: string; mime: string | null } | null };
const CAMPOS_POST = "id, conta_id, formato, legenda, status, video_midia_id, ig_container_id";

type Item = { caminho: string; mime: string };
const VIDEOS_CARROSSEL = ["video/mp4", "video/quicktime"];

/** Confere se o post pode sair: formato, imagens JPEG (vídeos MP4/MOV só no carrossel, Fase 12), o MP4 do Reels e a legenda. */
async function validar(db: Db, post: Post): Promise<{ itens: Item[] } | { video: string }> {
  if (!["post", "carrossel", "reels"].includes(post.formato)) throw new ErroUsuario("Por enquanto só post único, carrossel e Reels podem ser publicados.");
  if ((post.legenda ?? "").length > 2200) throw new ErroUsuario("A legenda passou de 2.200 caracteres.");
  if (post.formato === "reels") {
    if (!post.video_midia_id) throw new ErroUsuario("O Reels não tem vídeo.");
    const { data } = await db.from("midias").select("storage_path, mime, conta_id").eq("id", post.video_midia_id).maybeSingle();
    if (!data || data.conta_id !== post.conta_id || data.mime !== "video/mp4") throw new ErroUsuario("O vídeo do Reels precisa ser um MP4 do banco de mídias.");
    return { video: data.storage_path as string };
  }
  const { data, error } = await db
    .from("post_slides")
    .select("ordem, midia_id, midias(storage_path, mime)")
    .eq("post_id", post.id)
    .order("ordem");
  if (error) throw error;
  const slides = (data ?? []) as unknown as Slide[];
  if (post.formato === "post" && slides.length !== 1) throw new ErroUsuario("Post único precisa de exatamente 1 imagem.");
  if (post.formato === "carrossel" && (slides.length < 2 || slides.length > 10)) throw new ErroUsuario("Carrossel precisa de 2 a 10 imagens.");
  const aceito = (mime: string | null | undefined) => mime === "image/jpeg" || (post.formato === "carrossel" && VIDEOS_CARROSSEL.includes(mime ?? ""));
  const faltando = slides.filter((s) => !s.midias || !aceito(s.midias.mime));
  if (faltando.length) throw new ErroUsuario(`Imagens não preparadas (slides ${faltando.map((s) => s.ordem).join(", ")}). Clique em Publicar de novo.`, 409);
  return { itens: slides.map((s) => ({ caminho: s.midias!.storage_path, mime: s.midias!.mime! })) };
}

async function tokenInstagram(db: Db, contaId: string) {
  const conexao = await conexaoInstagram(db, contaId);
  if (conexao.status !== "conectado") throw new ErroUsuario("Instagram não conectado. Conecte em Conexões e custos.", 409);
  const { data: token } = await db.rpc("ler_segredo_conexao", { p_conexao: conexao.id });
  const { data: conta } = await db.from("contas").select("ig_user_id").eq("id", contaId).single();
  if (!token || !conta?.ig_user_id) throw new ErroUsuario("Instagram sem token ou sem conta profissional. Conecte de novo.", 409);
  return { token: token as string, igId: conta.ig_user_id as string, conexaoId: conexao.id };
}

/** Espera o container ficar pronto (imagens costumam levar poucos segundos). */
async function esperarContainer(id: string, token: string) {
  for (let i = 0; i < 20; i++) {
    const r = await graph<{ status_code?: string; status?: string }>(id, { fields: "status_code,status", access_token: token });
    if (!r.status_code || r.status_code === "FINISHED" || r.status_code === "PUBLISHED") return;
    if (r.status_code === "ERROR" || r.status_code === "EXPIRED") throw new ErroUsuario(`A Meta recusou a mídia: ${r.status ?? r.status_code}`, 422);
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  throw new ErroUsuario("A Meta demorou demais para processar as imagens. Tente de novo.", 504);
}

/** Copia os JPEG (e os vídeos do carrossel) para o bucket público e devolve as URLs. */
async function urlsPublicas(db: Db, post: Post, itens: Item[]) {
  const destino: string[] = [];
  const urls: string[] = [];
  const lote = crypto.randomUUID().slice(0, 8);
  for (const [i, { caminho, mime }] of itens.entries()) {
    const { data: arquivo, error } = await db.storage.from(PRIVADO).download(caminho);
    if (error || !arquivo) throw new Error(`Não foi possível ler a imagem ${i + 1}: ${error?.message}`);
    const ext = mime === "image/jpeg" ? "jpg" : mime === "video/quicktime" ? "mov" : "mp4";
    const alvo = `${post.conta_id}/${post.id}/${lote}-${i + 1}.${ext}`;
    const { error: eUp } = await db.storage.from(PUBLICO).upload(alvo, arquivo, { contentType: mime, upsert: true });
    if (eUp) throw new Error(`Não foi possível preparar a imagem ${i + 1}: ${eUp.message}`);
    destino.push(alvo);
    urls.push(db.storage.from(PUBLICO).getPublicUrl(alvo).data.publicUrl);
  }
  return { destino, urls };
}

type Ig = Awaited<ReturnType<typeof tokenInstagram>>;
const caminhoReels = (post: Post) => `${post.conta_id}/${post.id}/reel.mp4`;

/** Vídeo leva mais que imagem: espera até ~1 min. false = ainda processando (a fila termina depois). */
async function videoPronto(id: string, token: string, tentativas: number) {
  for (let i = 0; i < tentativas; i++) {
    const r = await graph<{ status_code?: string; status?: string }>(id, { fields: "status_code,status", access_token: token });
    if (r.status_code === "FINISHED" || r.status_code === "PUBLISHED") return true;
    if (r.status_code === "ERROR" || r.status_code === "EXPIRED") throw new ErroUsuario(`A Meta recusou o vídeo: ${r.status ?? r.status_code}`, 422);
    if (i < tentativas - 1) await new Promise((ok) => setTimeout(ok, 3000));
  }
  return false;
}

/** media_publish do container pronto, grava o post e cria a automação. */
async function concluir(db: Db, post: Post, ig: Ig, criacao: string) {
  const { id: mediaId } = await graphPost<{ id: string }>(`${ig.igId}/media_publish`, { creation_id: criacao, access_token: ig.token });
  const info = await graph<{ permalink?: string; timestamp?: string }>(mediaId, { fields: "permalink,timestamp", access_token: ig.token })
    .catch(() => ({} as { permalink?: string; timestamp?: string }));
  const { error } = await db.from("posts").update({
    status: "publicado", ig_media_id: mediaId, permalink: info.permalink ?? null, ig_container_id: null,
    publicado_em: info.timestamp ?? new Date().toISOString(), erro: null,
  }).eq("id", post.id);
  if (error) throw error;
  if (post.formato === "reels") await db.storage.from(PUBLICO).remove([caminhoReels(post)]);
  return { status: "publicado", ig_media_id: mediaId, permalink: info.permalink ?? null, automacao: await automacaoAposPublicar(db, post.id) };
}

/** Reels: copia o MP4 para o bucket público, cria o container REELS e publica se ficar pronto a tempo. */
async function publicarReels(db: Db, post: Post, ig: Ig, caminho: string) {
  const { data: arquivo, error } = await db.storage.from(PRIVADO).download(caminho);
  if (error || !arquivo) throw new Error(`Não foi possível ler o vídeo: ${error?.message}`);
  const alvo = caminhoReels(post);
  const { error: eUp } = await db.storage.from(PUBLICO).upload(alvo, arquivo, { contentType: "video/mp4", upsert: true });
  if (eUp) throw new Error(`Não foi possível preparar o vídeo: ${eUp.message}`);
  const url = db.storage.from(PUBLICO).getPublicUrl(alvo).data.publicUrl;
  const { id: criacao } = await graphPost<{ id: string }>(`${ig.igId}/media`, {
    media_type: "REELS", video_url: url, caption: post.legenda ?? "", share_to_feed: "true", access_token: ig.token,
  });
  await db.from("posts").update({ ig_container_id: criacao }).eq("id", post.id);
  if (!(await videoPronto(criacao, ig.token, 20))) return { status: "publicando", processando: true };
  return await concluir(db, post, ig, criacao);
}

/** Marca o post com erro (e o token como expirado, se for o caso). */
async function falhou(db: Db, post: Post, e: unknown, conexaoId?: string) {
  const mensagem = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  console.error("ig-publicar", post.id, mensagem);
  if (e instanceof ErroGraph && e.tokenInvalido && conexaoId) {
    await db.from("conexoes").update({
      status: "expirado", detalhe: "Token da Meta expirou ou foi revogado. Conecte de novo.", atualizado_em: new Date().toISOString(),
    }).eq("id", conexaoId);
  }
  const prefixo = e instanceof ErroGraph ? "A Meta recusou: " : "";
  await db.from("posts").update({ status: "erro", ig_container_id: null, erro: (prefixo + mensagem).slice(0, 500) }).eq("id", post.id);
  if (post.formato === "reels") await db.storage.from(PUBLICO).remove([caminhoReels(post)]);
  return { status: "erro", erro: prefixo + mensagem };
}

/** Fila: Reels cujo container ainda processava. Publica quando a Meta terminar. */
async function continuarReels(db: Db, post: Post) {
  let conexaoId: string | undefined;
  try {
    const ig = await tokenInstagram(db, post.conta_id);
    conexaoId = ig.conexaoId;
    if (!(await videoPronto(post.ig_container_id!, ig.token, 1))) return { status: "publicando", processando: true };
    return await concluir(db, post, ig, post.ig_container_id!);
  } catch (e) {
    return await falhou(db, post, e, conexaoId);
  }
}

/** Publica um post já reservado (status = publicando). Grava o resultado no próprio post. */
async function publicarReservado(db: Db, post: Post) {
  let copias: string[] = [];
  let conexaoId: string | undefined;
  try {
    const alvo = await validar(db, post);
    const ig = await tokenInstagram(db, post.conta_id);
    conexaoId = ig.conexaoId;
    if ("video" in alvo) return await publicarReels(db, post, ig, alvo.video);
    const { destino, urls } = await urlsPublicas(db, post, alvo.itens);
    copias = destino;
    const legenda = post.legenda ?? "";

    let criacao: string;
    if (urls.length === 1) {
      criacao = (await graphPost<{ id: string }>(`${ig.igId}/media`, { image_url: urls[0], caption: legenda, access_token: ig.token })).id;
    } else {
      const filhos: { id: string; video: boolean }[] = [];
      for (const [i, url] of urls.entries()) {
        const video = alvo.itens[i].mime !== "image/jpeg";
        const midia: Record<string, string> = video ? { media_type: "VIDEO", video_url: url } : { image_url: url };
        filhos.push({ id: (await graphPost<{ id: string }>(`${ig.igId}/media`, { ...midia, is_carousel_item: "true", access_token: ig.token })).id, video });
      }
      for (const f of filhos) {
        if (!f.video) await esperarContainer(f.id, ig.token);
        else if (!(await videoPronto(f.id, ig.token, 30))) {
          throw new ErroUsuario("A Meta ainda está processando o vídeo do carrossel. Tente publicar de novo em alguns minutos.", 504);
        }
      }
      criacao = (await graphPost<{ id: string }>(`${ig.igId}/media`, {
        media_type: "CAROUSEL", children: filhos.map((f) => f.id).join(","), caption: legenda, access_token: ig.token,
      })).id;
    }
    await esperarContainer(criacao, ig.token);
    return await concluir(db, post, ig, criacao);
  } catch (e) {
    return await falhou(db, post, e, conexaoId);
  } finally {
    if (copias.length) await db.storage.from(PUBLICO).remove(copias);
  }
}

/** Cria a automação pausada do post. Nunca derruba a publicação: o erro fica em imobinsta.automacoes. */
async function automacaoAposPublicar(db: Db, postId: string) {
  try {
    return await criarAutomacaoDoPost(db, postId);
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("ig-publicar automacao", postId, erro);
    return { status: "erro", erro };
  }
}

/** Reserva o post (troca de status atômica) para não publicar duas vezes. */
async function reservar(db: Db, postId: string, de: string[]) {
  const { data: atual } = await db.from("posts").select("tentativas").eq("id", postId).single();
  const { data, error } = await db
    .from("posts")
    .update({ status: "publicando", erro: null, tentativas: (atual?.tentativas ?? 0) + 1 })
    .eq("id", postId)
    .in("status", de)
    .select(CAMPOS_POST)
    .maybeSingle();
  if (error) throw error;
  return data as Post | null;
}

async function processarFila(db: Db) {
  const { data } = await db
    .from("posts")
    .select("id")
    .eq("status", "agendado")
    .lte("agendado_para", new Date().toISOString())
    .order("agendado_para")
    .limit(LOTE_FILA);
  const resultados = [];
  for (const { id } of data ?? []) {
    const post = await reservar(db, id, ["agendado"]);
    if (post) resultados.push({ post_id: id, ...(await publicarReservado(db, post)) });
  }
  // Reels cujo vídeo ainda processava na Meta quando o pedido terminou.
  const { data: processando } = await db.from("posts").select(CAMPOS_POST)
    .eq("status", "publicando").not("ig_container_id", "is", null).limit(LOTE_FILA);
  for (const post of (processando ?? []) as Post[]) resultados.push({ post_id: post.id, ...(await continuarReels(db, post)) });
  return { resultados };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST." }, 405);
  const db = admin();
  try {
    const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const segredo = req.headers.get("x-cron-segredo") ?? "";
    if (segredo) {
      const { data: ok } = await db.rpc("sync_cron_confere", { p_segredo: segredo });
      if (ok !== true) return json({ erro: "Agendador não autorizado." }, 401);
      return json(await processarFila(db));
    }

    const user = await usuario(req, db);
    if (!user) return json({ erro: "Faça login de novo." }, 401);
    const contaId = z.string().uuid().parse(corpo.conta_id);
    const postId = z.string().uuid().parse(corpo.post_id);
    if (!(await papelNaConta(db, contaId, user.id))) return json({ erro: "Sem acesso a esta conta." }, 403);
    const { data: post } = await db.from("posts").select(CAMPOS_POST).eq("id", postId).eq("conta_id", contaId).maybeSingle();
    if (!post) return json({ erro: "Post não encontrado nesta conta." }, 404);

    switch (corpo.acao) {
      case "publicar": {
        if (!["rascunho", "agendado"].includes(post.status)) throw new ErroUsuario(`Este post está "${post.status}" e não pode ser publicado agora.`, 409);
        await validar(db, post as Post);
        await tokenInstagram(db, contaId);
        const reservado = await reservar(db, postId, ["rascunho", "agendado"]);
        if (!reservado) throw new ErroUsuario("Outro pedido já está publicando este post.", 409);
        const r = await publicarReservado(db, reservado);
        return json(r, r.status === "publicado" ? 200 : 422);
      }
      case "agendar": {
        if (post.status !== "rascunho") throw new ErroUsuario("Só rascunhos podem ser agendados.", 409);
        const quando = new Date(z.string().datetime({ offset: true }).parse(corpo.quando));
        const agora = Date.now();
        if (quando.getTime() < agora + 5 * 60_000) throw new ErroUsuario("Escolha um horário pelo menos 5 minutos à frente.");
        if (quando.getTime() > agora + 75 * 24 * 3600_000) throw new ErroUsuario("O agendamento vai até 75 dias à frente.");
        await validar(db, post as Post);
        await tokenInstagram(db, contaId);
        const { data, error } = await db.from("posts")
          .update({ status: "agendado", agendado_para: quando.toISOString(), erro: null })
          .eq("id", postId).eq("status", "rascunho").select("agendado_para").maybeSingle();
        if (error) throw error;
        if (!data) throw new ErroUsuario("O post mudou de status. Atualize a página.", 409);
        return json({ status: "agendado", agendado_para: data.agendado_para });
      }
      case "rascunho": {
        const { data, error } = await db.from("posts")
          .update({ status: "rascunho", agendado_para: null })
          .eq("id", postId).in("status", ["agendado", "erro"]).select("id").maybeSingle();
        if (error) throw error;
        if (!data) throw new ErroUsuario("Só posts agendados ou com erro voltam para rascunho.", 409);
        return json({ status: "rascunho" });
      }
      default:
        return json({ erro: "Ação desconhecida." }, 400);
    }
  } catch (e) {
    if (e instanceof ErroUsuario) return json({ erro: e.message }, e.status);
    if (e instanceof z.ZodError) return json({ erro: `Dados inválidos: ${e.issues[0]?.path.join(".")} ${e.issues[0]?.message}` }, 400);
    console.error("ig-publicar:", e instanceof Error ? e.message : e);
    return json({ erro: "Falha inesperada ao publicar. Tente de novo." }, 500);
  }
});
