// ia-avatar — vídeo narrado com avatar (HeyGen), com o mesmo teto de gasto da ia-imagem (Fase 7.2).
//
// POST { acao, conta_id, ... } com JWT de um membro da conta:
//   catalogo {}                          → { avatares, vozes }  da conta HeyGen (para cadastrar em Meus avatares)
//   gerar    { roteiro_id, confirmar? }  → { status: "gerando" }   envia o roteiro para a HeyGen
//   status   { roteiro_id }              → { status, midia_id? }    confere; quando pronto, baixa o MP4 para o banco de mídias
//
// O avatar é treinado na HeyGen; o estúdio só usa os ids (imobinsta.avatares, com consentimento registrado).
// Custo: estimado por minuto de vídeo (secret HEYGEN_USD_POR_MINUTO, padrão 1,00) e recalculado pela duração real.
// Publicar com:  supabase functions deploy ia-avatar
import { z } from "npm:zod@3.25.76";
import { admin, CORS, type Db, json, papelNaConta, usuario } from "../_shared/comum.ts";

const HEYGEN = "https://api.heygen.com";
const BUCKET = "imobinsta-midias";
const USD_POR_MINUTO = Number(Deno.env.get("HEYGEN_USD_POR_MINUTO") ?? "1");
const PALAVRAS_POR_MINUTO = 150;

class ErroUsuario extends Error {
  constructor(mensagem: string, public status = 400, public extra: Record<string, unknown> = {}) {
    super(mensagem);
  }
}

async function chaveHeygen(db: Db, contaId: string) {
  const { data: c } = await db.from("conexoes").select("id").eq("conta_id", contaId).eq("provedor", "heygen").maybeSingle();
  if (c) {
    const { data } = await db.rpc("ler_segredo_conexao", { p_conexao: c.id });
    if (data) return data as string;
  }
  throw new ErroUsuario("HeyGen não conectada. Cole a chave em Conexões e custos.", 409);
}

async function heygen<T>(chave: string, caminho: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(`${HEYGEN}${caminho}`, {
    ...init,
    headers: { "X-Api-Key": chave, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    signal: AbortSignal.timeout(60_000),
  });
  const corpo = await resp.json().catch(() => ({}));
  if (resp.status === 401 || resp.status === 403) throw new ErroUsuario("A HeyGen recusou a chave. Troque em Conexões e custos.", 409);
  if (!resp.ok || corpo?.error) {
    const msg = corpo?.error?.message ?? corpo?.message ?? (typeof corpo?.error === "string" ? corpo.error : `HTTP ${resp.status}`);
    throw new ErroUsuario(`A HeyGen recusou: ${msg}`, 422);
  }
  return (corpo?.data ?? corpo) as T;
}

const minutos = (texto: string) => Math.max(0.25, texto.trim().split(/\s+/).length / PALAVRAS_POR_MINUTO);

// ---------- Ações ----------------------------------------------------------------------------

async function acaoCatalogo(db: Db, contaId: string) {
  const chave = await chaveHeygen(db, contaId);
  type Av = { avatar_id: string; avatar_name?: string; preview_image_url?: string };
  type Vz = { voice_id: string; name?: string; language?: string; gender?: string };
  const [a, v] = await Promise.all([
    heygen<{ avatars?: Av[] }>(chave, "/v2/avatars"),
    heygen<{ voices?: Vz[] }>(chave, "/v2/voices"),
  ]);
  // Só avatares (character.type "avatar"); talking photos usam outro tipo na geração e ficam de fora.
  const avatares = (a.avatars ?? []).map((x) => ({ id: x.avatar_id, nome: x.avatar_name ?? x.avatar_id, preview: x.preview_image_url ?? null }));
  // Português primeiro, para a lista não abrir em centenas de vozes em inglês.
  const vozes = (v.voices ?? [])
    .map((x) => ({ id: x.voice_id, nome: x.name ?? x.voice_id, idioma: x.language ?? "", genero: x.gender ?? "" }))
    .sort((x, y) => Number(/portug/i.test(y.idioma)) - Number(/portug/i.test(x.idioma)) || x.nome.localeCompare(y.nome));
  return { avatares, vozes };
}

async function lerRoteiro(db: Db, contaId: string, roteiroId: string) {
  const { data, error } = await db.from("roteiros")
    .select("id, conta_id, titulo, texto, status, video_externo_id, avatar_id, avatares(avatar_externo_id, voz_externa_id, ativo, nome)")
    .eq("id", roteiroId).eq("conta_id", contaId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroUsuario("Roteiro não encontrado nesta conta.", 404);
  return data as unknown as {
    id: string; titulo: string; texto: string; status: string; video_externo_id: string | null; avatar_id: string | null;
    avatares: { avatar_externo_id: string; voz_externa_id: string; ativo: boolean; nome: string } | null;
  };
}

async function acaoGerar(db: Db, contaId: string, userId: string, corpo: Record<string, unknown>) {
  const r = await lerRoteiro(db, contaId, z.string().uuid().parse(corpo.roteiro_id));
  if (!["rascunho", "erro"].includes(r.status)) throw new ErroUsuario(`Este roteiro está "${r.status}".`, 409);
  if (!r.avatares || !r.avatares.ativo) throw new ErroUsuario("Escolha um avatar ativo cadastrado em Meus avatares.", 409);

  const { data: cfg } = await db.from("config_ia").select("teto_mensal_usd, confirmar_acima_usd").eq("conta_id", contaId).maybeSingle();
  const teto = Number(cfg?.teto_mensal_usd ?? 30);
  const confirmarAcima = Number(cfg?.confirmar_acima_usd ?? 2);
  const { data: g } = await db.rpc("gasto_ia_mes", { p_conta: contaId });
  const gasto = Number(g ?? 0);
  const estimativa = minutos(r.texto) * USD_POR_MINUTO;
  if (gasto + estimativa > teto) {
    throw new ErroUsuario(`Teto do mês atingido: US$ ${gasto.toFixed(2)} de US$ ${teto.toFixed(2)}. Aumente o teto em Conexões e custos.`, 402);
  }
  if (estimativa > confirmarAcima && corpo.confirmar !== true) {
    throw new ErroUsuario(`Este vídeo custa cerca de US$ ${estimativa.toFixed(2)}. Confirme para continuar.`, 409, {
      precisa_confirmar: true, custo_estimado_usd: estimativa,
    });
  }

  const chave = await chaveHeygen(db, contaId);
  // Reserva antes de chamar a HeyGen: dois cliques não geram (nem cobram) dois vídeos.
  const { data: reservado } = await db.from("roteiros").update({ status: "gerando", erro: null })
    .eq("id", r.id).in("status", ["rascunho", "erro"]).select("id").maybeSingle();
  if (!reservado) throw new ErroUsuario("Este roteiro já está sendo gerado.", 409);
  try {
    const v = await heygen<{ video_id: string }>(chave, "/v2/video/generate", {
      method: "POST",
      body: JSON.stringify({
        title: r.titulo.slice(0, 100),
        caption: false,
        dimension: { width: 1080, height: 1920 },
        video_inputs: [{
          character: { type: "avatar", avatar_id: r.avatares.avatar_externo_id, avatar_style: "normal" },
          voice: { type: "text", input_text: r.texto, voice_id: r.avatares.voz_externa_id },
        }],
      }),
    });
    await db.from("roteiros").update({ video_externo_id: v.video_id }).eq("id", r.id);
    return { status: "gerando", estimativa_usd: estimativa };
  } catch (e) {
    const erro = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await db.from("roteiros").update({ status: "erro", erro }).eq("id", r.id);
    await db.from("geracoes_ia").insert({ conta_id: contaId, provedor: "heygen", tipo: "avatar", acao: "gerar", criado_por: userId, status: "erro", erro, custo_usd: 0 });
    throw e;
  }
}

async function acaoStatus(db: Db, contaId: string, userId: string, corpo: Record<string, unknown>) {
  const r = await lerRoteiro(db, contaId, z.string().uuid().parse(corpo.roteiro_id));
  if (r.status !== "gerando") return { status: r.status };
  if (!r.video_externo_id) return { status: "gerando" };
  const chave = await chaveHeygen(db, contaId);
  const s = await heygen<{ status: string; video_url?: string; duration?: number; error?: { message?: string } | string | null }>(
    chave, `/v1/video_status.get?video_id=${encodeURIComponent(r.video_externo_id)}`,
  );
  if (s.status === "failed") {
    const erro = `A HeyGen não gerou o vídeo: ${typeof s.error === "string" ? s.error : s.error?.message ?? "sem detalhe"}`.slice(0, 500);
    await db.from("roteiros").update({ status: "erro", erro }).eq("id", r.id);
    await db.from("geracoes_ia").insert({ conta_id: contaId, provedor: "heygen", tipo: "avatar", acao: "gerar", criado_por: userId, status: "erro", erro, custo_usd: 0 });
    return { status: "erro", erro };
  }
  if (s.status !== "completed" || !s.video_url) return { status: "gerando", heygen: s.status };

  // Pronto: baixa o MP4 (a URL da HeyGen expira) e guarda no banco de mídias.
  const video = await fetch(s.video_url, { signal: AbortSignal.timeout(120_000) });
  if (!video.ok) throw new Error(`Não foi possível baixar o vídeo da HeyGen (${video.status}).`);
  const bytes = new Uint8Array(await video.arrayBuffer());
  const caminho = `${contaId}/Avatar/${r.id}.mp4`;
  const { error: eUp } = await db.storage.from(BUCKET).upload(caminho, bytes, { contentType: "video/mp4", upsert: true });
  if (eUp) throw new Error(`Não foi possível guardar o vídeo: ${eUp.message}`);
  const duracao = Number(s.duration) || minutos(r.texto) * 60;
  const { data: midia, error: eMid } = await db.from("midias").upsert({
    conta_id: contaId, pasta: "Avatar", tipo: "video", nome: r.titulo.slice(0, 80), storage_path: caminho, mime: "video/mp4",
    tamanho_bytes: bytes.length, largura: 1080, altura: 1920, duracao_s: Number(duracao.toFixed(2)), origem: "ia", criado_por: userId,
  }, { onConflict: "storage_path" }).select("id").single();
  if (eMid) throw eMid;
  const custo = Number(((duracao / 60) * USD_POR_MINUTO).toFixed(4));
  // Só quem trocar gerando → pronto registra o custo (dois status simultâneos não cobram duas vezes).
  const { data: virou } = await db.from("roteiros").update({ status: "pronto", midia_id: midia.id, custo_usd: custo, erro: null })
    .eq("id", r.id).eq("status", "gerando").select("id").maybeSingle();
  if (virou) {
    await db.from("geracoes_ia").insert({
      conta_id: contaId, provedor: "heygen", tipo: "avatar", acao: "gerar", modelo: "heygen-v2", criado_por: userId, status: "ok", custo_usd: custo,
    });
  }
  return { status: "pronto", midia_id: midia.id, storage_path: caminho, custo_usd: custo };
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
      case "catalogo":
        return json(await acaoCatalogo(db, contaId));
      case "gerar":
        return json(await acaoGerar(db, contaId, user.id, corpo));
      case "status":
        return json(await acaoStatus(db, contaId, user.id, corpo));
      default:
        return json({ erro: "Ação desconhecida." }, 400);
    }
  } catch (e) {
    if (e instanceof ErroUsuario) return json({ erro: e.message, ...e.extra }, e.status);
    if (e instanceof z.ZodError) return json({ erro: `Dados inválidos: ${e.issues[0]?.path.join(".")} ${e.issues[0]?.message}` }, 400);
    console.error("ia-avatar", e instanceof Error ? e.message : e);
    return json({ erro: "Falha inesperada no vídeo com avatar. Tente de novo." }, 500);
  }
});
