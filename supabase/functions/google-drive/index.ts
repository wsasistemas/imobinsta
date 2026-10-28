// google-drive — ponte com o Google Vids pelo Drive da conta (Fase 11). O Vids não tem API: o estúdio prepara
// a pasta, a pessoa monta e exporta o vídeo no Vids, e o estúdio importa o MP4 de "prontos/" (etapa 11.3).
//
// POST { acao, conta_id, ... } com JWT de um membro da conta:
//   vids { roteiro_id, midia_ids? } → { url, criada }  cria "Estúdio imobinsta/Vids/<título · dd-mm>" com roteiro.txt,
//        legenda.txt, as imagens e a subpasta "prontos/". Se o roteiro já tem pasta, devolve a mesma.
//        Sem midia_ids: o logo mais recente e até 6 imagens da pasta do produto no Banco de mídias.
//
// Publicar com:  supabase functions deploy google-drive
import { z } from "npm:zod@3.25.76";
import { admin, CORS, type Db, json, papelNaConta, usuario } from "../_shared/comum.ts";
import { acessoGoogle, criarNoDrive, ErroGoogle, PASTA, pastaGarantida } from "../_shared/google.ts";

const BUCKET = "imobinsta-midias";
const MAX_IMAGENS = 6;

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
