// google-drive — ponte com o Google Vids pelo Drive da conta (Fase 11). O Vids não tem API: o estúdio prepara
// a pasta, a pessoa monta e exporta o vídeo no Vids, e o estúdio importa o MP4 de "prontos/" (etapa 11.3).
//
// POST { acao, conta_id, ... } com JWT de um membro da conta:
//   vids { roteiro_id, midia_ids? } → { url, criada }  cria "Estúdio imobinsta/Vids/<título · dd-mm>" com roteiro.txt,
//        legenda.txt, as imagens e a subpasta "prontos/". Se o roteiro já tem pasta, devolve a mesma.
//        Sem midia_ids: o logo mais recente e até 6 imagens da pasta do produto no Banco de mídias.
//   buscar { roteiro_id } → { status: "pronto", midia_id } | { status: "vazio" }  pega o vídeo mais recente de
//        "prontos/", copia para o Banco de mídias (pasta Vids) e marca o roteiro como pronto (segue para Reels).
//
// Publicar com:  supabase functions deploy google-drive
import { z } from "npm:zod@3.25.76";
import { admin, CORS, type Db, json, papelNaConta, usuario } from "../_shared/comum.ts";
import { acessoGoogle, baixarDoDrive, criarNoDrive, drive, ErroGoogle, PASTA, pastaGarantida } from "../_shared/google.ts";

const BUCKET = "imobinsta-midias";
const MAX_IMAGENS = 6;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // limite do bucket imobinsta-midias

class ErroUsuario extends Error {
  constructor(mensagem: string, public status = 400) {
    super(mensagem);
  }
}

type Midia = { id: string; nome: string; storage_path: string; mime: string | null };

const PedidoVids = z.object({ roteiro_id: z.string().uuid(), midia_ids: z.array(z.string().uuid()).max(10).optional() });

async function imagensDoRoteiro(db: Db, contaId: string, produto: string | null, ids?: string[]): Promise<Midia[]> {
  const campos = "id, nome, storage_path, mime";
  if (ids?.length) {
    const { data, error } = await db.from("midias").select(campos).eq("conta_id", contaId).in("id", ids).in("tipo", ["imagem", "logo"]);
    if (error) throw error;
    return data as Midia[];
  }
  const recentes = (tipo: string) =>
    db.from("midias").select(campos).eq("conta_id", contaId).eq("tipo", tipo).order("criado_em", { ascending: false });
  const [logo, doProduto] = await Promise.all([
    recentes("logo").limit(1),
    produto
      ? recentes("imagem").eq("pasta", produto).limit(MAX_IMAGENS)
      : Promise.resolve({ data: [] as Midia[], error: null }),
  ]);
  if (logo.error) throw logo.error;
  if (doProduto.error) throw doProduto.error;
  return [...(logo.data as Midia[]), ...(doProduto.data as Midia[])];
}

function nomePasta(titulo: string) {
  const d = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).replace("/", "-");
  return `${titulo.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 90)} · ${d}`;
}

function textoRoteiro(r: { titulo: string; produto: string | null; texto: string }) {
  return [
    r.titulo,
    r.produto ? `Produto: ${r.produto}` : "",
    "",
    "ROTEIRO (o que é falado)",
    r.texto.trim(),
    "",
    "COMO MONTAR NO GOOGLE VIDS",
    "1. Em vids.google.com, crie um vídeo vertical (9:16) e use este roteiro e as imagens desta pasta.",
    "2. Exporte em MP4 e salve o arquivo na subpasta \"prontos\" desta pasta.",
    "3. No estúdio, abra o roteiro e clique em \"Buscar vídeo pronto\" para virar Reels.",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}

async function acaoVids(db: Db, contaId: string, corpo: unknown) {
  const p = PedidoVids.parse(corpo);
  const { data: r, error } = await db.from("roteiros")
    .select("id, titulo, produto, texto, legenda, drive_url").eq("id", p.roteiro_id).eq("conta_id", contaId).maybeSingle();
  if (error) throw error;
  if (!r) throw new ErroUsuario("Roteiro não encontrado.", 404);
  if (r.drive_url) return { url: r.drive_url as string, criada: false };

  const token = await acessoGoogle(db, contaId);
  const raiz = await pastaGarantida(token, "Estúdio imobinsta");
  const vids = await pastaGarantida(token, "Vids", raiz.id);
  const pasta = await criarNoDrive(token, { name: nomePasta(r.titulo), mimeType: PASTA, parents: [vids.id] });
  const prontos = await criarNoDrive(token, { name: "prontos", mimeType: PASTA, parents: [pasta.id] });

  await criarNoDrive(token, { name: "roteiro.txt", parents: [pasta.id] }, { bytes: textoRoteiro(r), mime: "text/plain; charset=UTF-8" });
  if (r.legenda?.trim()) {
    await criarNoDrive(token, { name: "legenda.txt", parents: [pasta.id] }, { bytes: r.legenda.trim(), mime: "text/plain; charset=UTF-8" });
  }

  // Imagens: uma falha não derruba a pasta; o que não subiu volta na resposta.
  const faltaram: string[] = [];
  for (const m of await imagensDoRoteiro(db, contaId, r.produto, p.midia_ids)) {
    const { data: arq, error: eArq } = await db.storage.from(BUCKET).download(m.storage_path);
    if (eArq || !arq) {
      faltaram.push(m.nome);
      continue;
    }
    try {
      await criarNoDrive(token, { name: m.nome, parents: [pasta.id] }, { bytes: new Uint8Array(await arq.arrayBuffer()), mime: m.mime ?? arq.type ?? "application/octet-stream" });
    } catch (e) {
      console.error("google-drive imagem:", m.id, e instanceof Error ? e.message : e);
      faltaram.push(m.nome);
    }
  }

  const url = pasta.webViewLink ?? `https://drive.google.com/drive/folders/${pasta.id}`;
  const { error: eUp } = await db.from("roteiros").update({
    drive_pasta_id: pasta.id, drive_prontos_id: prontos.id, drive_url: url, drive_criado_em: new Date().toISOString(),
  }).eq("id", r.id);
  if (eUp) throw eUp;
  return { url, criada: true, faltaram };
}

type ArquivoDrive = { id: string; name: string; mimeType: string; size?: string; videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string } };

async function acaoBuscar(db: Db, contaId: string, userId: string, corpo: unknown) {
  const { roteiro_id } = z.object({ roteiro_id: z.string().uuid() }).parse(corpo);
  const { data: r, error } = await db.from("roteiros")
    .select("id, titulo, status, drive_prontos_id").eq("id", roteiro_id).eq("conta_id", contaId).maybeSingle();
  if (error) throw error;
  if (!r) throw new ErroUsuario("Roteiro não encontrado.", 404);
  if (!r.drive_prontos_id) throw new ErroUsuario("Este roteiro ainda não tem pasta no Drive. Clique em \"Preparar pasta no Drive\".", 409);
  if (r.status === "gerando") throw new ErroUsuario("A HeyGen ainda está gerando o vídeo deste roteiro.", 409);

  const token = await acessoGoogle(db, contaId);
  const { files } = await drive<{ files: ArquivoDrive[] }>(token, "files", {
    q: `'${r.drive_prontos_id}' in parents and mimeType contains 'video/' and trashed = false`,
    orderBy: "createdTime desc",
    pageSize: "1",
    fields: "files(id,name,mimeType,size,videoMediaMetadata(width,height,durationMillis))",
  });
  const v = files[0];
  if (!v) return { status: "vazio" };
  if (Number(v.size ?? 0) > MAX_VIDEO_BYTES) throw new ErroUsuario(`O vídeo "${v.name}" passa de 100 MB. Exporte de novo em 1080p no Vids.`, 413);
  if (!["video/mp4", "video/quicktime", "video/webm"].includes(v.mimeType)) {
    throw new ErroUsuario(`O arquivo "${v.name}" é ${v.mimeType}. Exporte em MP4 no Vids.`, 415);
  }

  // O id do arquivo no Drive vira o nome no Storage: buscar de novo o mesmo vídeo não duplica.
  const bytes = await baixarDoDrive(token, v.id);
  const caminho = `${contaId}/Vids/${v.id}.${v.mimeType === "video/mp4" ? "mp4" : v.mimeType === "video/webm" ? "webm" : "mov"}`;
  const { error: eUp } = await db.storage.from(BUCKET).upload(caminho, bytes, { contentType: v.mimeType, upsert: true });
  if (eUp) throw new Error(`Não foi possível guardar o vídeo: ${eUp.message}`);
  const meta = v.videoMediaMetadata ?? {};
  const { data: midia, error: eMid } = await db.from("midias").upsert({
    conta_id: contaId, pasta: "Vids", tipo: "video", nome: r.titulo.slice(0, 80), storage_path: caminho, mime: v.mimeType,
    tamanho_bytes: bytes.length, largura: meta.width ?? null, altura: meta.height ?? null,
    duracao_s: meta.durationMillis ? Number((Number(meta.durationMillis) / 1000).toFixed(2)) : null, origem: "upload", criado_por: userId,
  }, { onConflict: "storage_path" }).select("id").single();
  if (eMid) throw eMid;

  const { error: eR } = await db.from("roteiros").update({ status: "pronto", midia_id: midia.id, erro: null }).eq("id", r.id);
  if (eR) throw eR;
  return { status: "pronto", midia_id: midia.id, arquivo: v.name };
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
      case "vids":
        return json(await acaoVids(db, contaId, corpo));
      case "buscar":
        return json(await acaoBuscar(db, contaId, user.id, corpo));
      default:
        return json({ erro: "Ação desconhecida." }, 400);
    }
  } catch (e) {
    if (e instanceof ErroUsuario) return json({ erro: e.message }, e.status);
    if (e instanceof ErroGoogle) return json({ erro: `Google Drive: ${e.message}` }, e.codigo === "invalid_grant" || e.codigo === "sem_token" ? 409 : 502);
    if (e instanceof z.ZodError) return json({ erro: `Dados inválidos: ${e.issues[0]?.path.join(".")} ${e.issues[0]?.message}` }, 400);
    console.error("google-drive", e instanceof Error ? e.message : e);
    return json({ erro: "Falha inesperada ao falar com o Drive. Tente de novo." }, 500);
  }
});
