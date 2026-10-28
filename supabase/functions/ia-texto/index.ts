// ia-texto — IA de texto do estúdio (Gemini). A IA nunca gera imagem aqui: só preenche JSON de templates.
//
// POST { acao, conta_id, ... } com JWT de um membro da conta:
//   link    { url }                                  → { titulo, descricao, corpo }   (lê a página, sem IA)
//   prompt  { briefing, base? }                      → { prompt }                     (prompt adaptado / refinar)
//   gerar   { post_id?, prompt, n_slides }           → { slides, legenda, hashtags }
//   editar  { post_id?, slide, pedido, n, total }    → { alteracoes, resposta }
//   pautas  { inicio }  (segunda-feira AAAA-MM-DD)   → { criadas }  8 pautas origem 'ia' (2/semana, ter e sex)
//   roteiro { tema, produto, segundos }              → { titulo, texto, legenda, hashtags }  fala do vídeo com avatar
//   dna     { url }  (só o dono)                     → DNA da marca: cores, fontes, imagens (banco de mídias) e tom (Gemini)
//   campanhas {}                                     → 3 campanhas sugeridas (status "sugerida")
//   aprovar_campanha { campanha_id, inicio }         → as sugestões viram pautas no Calendário
// Toda geração recebe o DNA da marca da conta (textoDna), se existir.
//   chave   { chave }  (só o dono)                   → { ok }  grava a chave do Gemini no Vault
//
// Toda chamada ao Gemini fica em geracoes_ia (custo 0 na cota gratuita).
// Chave: conexão "gemini" da conta (Vault). Sem ela, usa o secret GEMINI_API_KEY, se existir.
// Publicar com:  supabase functions deploy ia-texto
import { z } from "npm:zod@3.25.76";
import { admin, CORS, type Db, json, papelNaConta, usuario } from "../_shared/comum.ts";
import { Edicao, FORMATO_SLIDE, Geracao, PromptAdaptado } from "../_shared/slides.ts";

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
// gemini-2.5-flash não está mais disponível para contas novas (404 em 28/10/2026); o próprio erro indica o 3.8.
const MODELO = Deno.env.get("GEMINI_MODELO") ?? "gemini-3.8-flash";

const MARCA = `Marca: WSA Sistemas de IA (@wsasistemas.ia). Vende um ecossistema de sistemas com IA para empresas:
ERP com integração nativa TOTVS RM, sistema para imobiliárias, portal de compras, helpdesk, cobrança e assinatura
de contratos, aprovações e RH, e sistema para confeitarias/docerias. Público: gestores e donos de empresa no Brasil.
Escreva em português do Brasil, direto, sem clichê, sem travessão longo (—) e sem prometer números que não foram dados.`;

class ErroUsuario extends Error {
  constructor(mensagem: string, public status = 400) {
    super(mensagem);
  }
}

// ---------- Chave e chamada ao Gemini ----------------------------------------------------------

async function conexaoGemini(db: Db, contaId: string) {
  const { data, error } = await db.from("conexoes").select("id").eq("conta_id", contaId).eq("provedor", "gemini").maybeSingle();
  if (error) throw error;
  return data?.id as string | undefined;
}

async function chaveGemini(db: Db, contaId: string) {
  const id = await conexaoGemini(db, contaId);
  if (id) {
    const { data } = await db.rpc("ler_segredo_conexao", { p_conexao: id });
    if (data) return data as string;
  }
  const doSecret = Deno.env.get("GEMINI_API_KEY");
  if (doSecret) return doSecret;
  throw new ErroUsuario("Gemini não conectado. Cole a chave em Conexões e custos.", 409);
}

type Uso = { promptTokenCount?: number; candidatesTokenCount?: number };

// Sobrecarga do Gemini (500/503) costuma passar em segundos: tenta de novo antes de desistir.
const ESPERAS_SOBRECARGA_MS = [2_000, 5_000];

async function gemini(chave: string, instrucao: string, pedido: string) {
  let resp: Response;
  for (let tentativa = 0; ; tentativa++) {
    resp = await fetch(`${GEMINI}/models/${MODELO}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instrucao }] },
        contents: [{ role: "user", parts: [{ text: pedido }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.8 },
      }),
    });
    if ((resp.status !== 503 && resp.status !== 500) || tentativa >= ESPERAS_SOBRECARGA_MS.length) break;
    await resp.body?.cancel();
    await new Promise((ok) => setTimeout(ok, ESPERAS_SOBRECARGA_MS[tentativa]));
  }
  const corpo = await resp.json().catch(() => ({}));
  if (resp.status === 503) throw new ErroUsuario("O Gemini está sobrecarregado agora (pico de uso no Google). Tente de novo em alguns minutos.", 503);
  if (resp.status === 429) throw new ErroUsuario("Cota gratuita do Gemini esgotada por agora. Tente de novo em 1 minuto.", 429);
  if (resp.status === 400 && /API key/i.test(corpo?.error?.message ?? "")) throw new ErroUsuario("Chave do Gemini inválida. Troque em Conexões e custos.", 409);
  // Recusa do Gemini (crédito, região, modelo sobrecarregado...): a mensagem dele ajuda mais que um "falha inesperada".
  if (!resp.ok) throw new ErroUsuario(`O Gemini recusou (${resp.status}): ${corpo?.error?.message ?? "sem detalhe"}`, 502);
  const texto: string = corpo?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  return { texto, uso: (corpo?.usageMetadata ?? {}) as Uso };
}

/** Chama o Gemini, valida o JSON com Zod (1 nova tentativa se vier fora do formato) e registra em geracoes_ia. */
async function gerarJson<T>(
  ctx: { db: Db; contaId: string; userId: string; postId?: string; acao: string },
  esquema: z.ZodType<T>,
  instrucao: string,
  pedido: string,
): Promise<T> {
  const chave = await chaveGemini(ctx.db, ctx.contaId);
  // DNA da marca (Fase 10) vai junto em toda geração, menos na própria leitura do DNA.
  if (ctx.acao !== "dna") instrucao += await textoDna(ctx.db, ctx.contaId);
  const registro = { conta_id: ctx.contaId, post_id: ctx.postId ?? null, provedor: "gemini", tipo: "texto", acao: ctx.acao, modelo: MODELO, criado_por: ctx.userId, custo_usd: 0 };
  let erro = "";
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const extra = tentativa ? `\n\nA resposta anterior veio fora do formato (${erro}). Devolva SOMENTE o JSON válido.` : "";
      const { texto, uso } = await gemini(chave, instrucao, pedido + extra);
      let bruto: unknown = null;
      try {
        bruto = JSON.parse(texto.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      } catch {
        /* cai na validação abaixo como "não era JSON" */
      }
      const valido = esquema.safeParse(bruto);
      await ctx.db.from("geracoes_ia").insert({
        ...registro, tokens_entrada: uso.promptTokenCount ?? null, tokens_saida: uso.candidatesTokenCount ?? null,
        status: valido.success ? "ok" : "erro", erro: valido.success ? null : valido.error.issues[0]?.message ?? "JSON inválido",
      });
      if (valido.success) return valido.data;
      erro = valido.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 3).join("; ");
    } catch (e) {
      if (e instanceof ErroUsuario) {
        await ctx.db.from("geracoes_ia").insert({ ...registro, status: "erro", erro: e.message });
        throw e;
      }
      await ctx.db.from("geracoes_ia").insert({ ...registro, status: "erro", erro: String((e as Error).message).slice(0, 300) });
      throw e;
    }
  }
  throw new ErroUsuario(`A IA devolveu um formato inválido duas vezes (${erro}). Tente de novo.`, 502);
}

/** Resumo do DNA da marca para anexar às instruções da IA. Vazio se a conta ainda não tem DNA. */
async function textoDna(db: Db, contaId: string) {
  const { data: d } = await db.from("marca_dna").select("tom, publico, proposta, pilares, usar, evitar").eq("conta_id", contaId).maybeSingle();
  if (!d) return "";
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).join(", ") : "");
  const tom = (d.tom ?? {}) as { adjetivos?: string[]; descricao?: string; exemplos?: string[] };
  const linhas = [
    lista(tom.adjetivos) && `Tom de voz: ${lista(tom.adjetivos)}.`,
    tom.descricao && `Como a marca fala: ${tom.descricao}`,
    lista(tom.exemplos) && `Frases no estilo da marca: ${lista(tom.exemplos)}`,
    d.publico && `Público: ${d.publico}`,
    d.proposta && `Proposta de valor: ${d.proposta}`,
    lista(d.pilares) && `Pilares de conteúdo: ${lista(d.pilares)}.`,
    lista(d.usar) && `Palavras para usar: ${lista(d.usar)}.`,
    lista(d.evitar) && `NUNCA use: ${lista(d.evitar)}.`,
  ].filter(Boolean);
  return linhas.length ? `\n\nDNA DA MARCA (siga o tom e o vocabulário):\n${linhas.join("\n")}` : "";
}

// ---------- Leitura de link ------------------------------------------------------------------

function hostBloqueado(host: string) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") ||
    /^(\d{1,3}\.){3}\d{1,3}$/.test(h) || h.includes(":") // IP literal (v4 ou v6): só domínio público
  );
}

function decodificar(s: string) {
  return s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ").trim();
}

function meta(html: string, nome: string) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${nome}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0];
  return tag ? decodificar(/content=["']([^"']*)["']/i.exec(tag)?.[1] ?? "") : "";
}

async function lerLink(endereco: string) {
  let url: URL;
  try {
    url = new URL(endereco);
  } catch {
    throw new ErroUsuario("Link inválido.");
  }
  if (!/^https?:$/.test(url.protocol) || hostBloqueado(url.hostname)) throw new ErroUsuario("Use um link público (http ou https).");

  let resp: Response | undefined;
  for (let salto = 0; salto < 4; salto++) {
    resp = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EstudioImobinsta/1.0)", Accept: "text/html" },
      signal: AbortSignal.timeout(10_000),
    });
    const destino = resp.headers.get("location");
    if (resp.status >= 300 && resp.status < 400 && destino) {
      url = new URL(destino, url);
      if (!/^https?:$/.test(url.protocol) || hostBloqueado(url.hostname)) throw new ErroUsuario("O link redireciona para um endereço não permitido.");
      continue;
    }
    break;
  }
  if (!resp?.ok) throw new ErroUsuario(`A página respondeu ${resp?.status ?? "sem resposta"}.`);
  if (!/html/i.test(resp.headers.get("content-type") ?? "")) throw new ErroUsuario("O link não é uma página HTML.");

  const bruto = await resp.text();
  const html = bruto.slice(0, 1_500_000);
  const titulo = meta(html, "og:title") || decodificar(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const descricao = meta(html, "description") || meta(html, "og:description");
  const corpo = decodificar(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, ". ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/(\.\s*){2,}/g, ". ").slice(0, 4000);
  return { url: url.toString(), titulo: titulo.slice(0, 200), descricao: descricao.slice(0, 400), corpo };
}

// ---------- DNA da marca: ler o site (Fase 10) ---------------------------------------------------

/** GET com os mesmos cuidados do lerLink: só host público, redirecionamento conferido, limite de tamanho. */
async function buscar(endereco: string, accept: string, limite: number) {
  let url = new URL(endereco);
  if (!/^https?:$/.test(url.protocol) || hostBloqueado(url.hostname)) return null;
  for (let salto = 0; salto < 4; salto++) {
    const resp = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EstudioImobinsta/1.0)", Accept: accept },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!resp) return null;
    const destino = resp.headers.get("location");
    if (resp.status >= 300 && resp.status < 400 && destino) {
      url = new URL(destino, url);
      if (!/^https?:$/.test(url.protocol) || hostBloqueado(url.hostname)) return null;
      continue;
    }
    if (!resp.ok) return null;
    const tamanho = Number(resp.headers.get("content-length") ?? 0);
    if (tamanho > limite) return null;
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes.length > limite) return null;
    return { url: url.toString(), tipo: resp.headers.get("content-type") ?? "", bytes };
  }
  return null;
}

const texto = (b: Uint8Array) => new TextDecoder().decode(b);

/** Cores mais usadas no HTML/CSS, sem brancos, pretos e cinzas (são neutros, não identidade). */
function coresDo(css: string, temaCor: string | null) {
  const conta = new Map<string, number>();
  const somar = (hex: string, peso = 1) => {
    let h = hex.toLowerCase();
    if (h.length === 4) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 24) return; // cinza, branco ou preto
    conta.set(h, (conta.get(h) ?? 0) + peso);
  };
  for (const m of css.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi)) somar(m[0]);
  for (const m of css.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/gi)) {
    somar("#" + [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join(""));
  }
  if (temaCor && /^#[0-9a-f]{3,6}$/i.test(temaCor)) somar(temaCor, 1000);
  return [...conta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([h]) => h.toUpperCase());
}

/** Fontes: famílias do Google Fonts primeiro, depois as font-family mais comuns (sem as genéricas). */
function fontesDo(html: string, css: string) {
  const google = [...html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'>]+)/gi)]
    .flatMap((m) => [...decodeURIComponent(m[1]).matchAll(/family=([^:&;]+)/g)].map((f) => f[1].replace(/\+/g, " ").trim()));
  const genericas = /^(inherit|initial|sans-serif|serif|monospace|system-ui|-apple-system|blinkmacsystemfont|segoe ui|arial|helvetica|roboto|ui-sans-serif|var\(.*)$/i;
  const conta = new Map<string, number>();
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const primeira = m[1].split(",")[0].replace(/["']/g, "").trim();
    if (primeira && !genericas.test(primeira)) conta.set(primeira, (conta.get(primeira) ?? 0) + 1);
  }
  const todas = [...new Set([...google, ...[...conta.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f)])];
  return { titulo: todas[0] ?? "", texto: todas[1] ?? todas[0] ?? "" };
}

/** Imagens candidatas: logo (ícones e <img> com "logo"), og:image e as primeiras imagens da página. */
function imagensDo(html: string, base: URL) {
  const abs = (s: string) => { try { return new URL(decodificar(s), base).toString(); } catch { return null; } };
  const lista: { url: string; origem: string }[] = [];
  const add = (s: string | null | undefined, origem: string) => {
    const u = s ? abs(s) : null;
    if (u && /^https?:/.test(u) && !/\.svg(\?|$)/i.test(u) && !lista.some((x) => x.url === u)) lista.push({ url: u, origem });
  };
  for (const m of html.matchAll(/<img[^>]+>/gi)) {
    const tag = m[0];
    if (/logo/i.test(tag)) add(/\ssrc=["']([^"']+)["']/i.exec(tag)?.[1], "logo");
  }
  add(meta(html, "og:image"), "og:image");
  for (const m of html.matchAll(/<link[^>]+rel=["'](?:apple-touch-icon|icon)["'][^>]*>/gi)) add(/href=["']([^"']+)["']/i.exec(m[0])?.[1], "ícone");
  for (const m of html.matchAll(/<img[^>]+\ssrc=["']([^"']+)["']/gi)) add(m[1], "página");
  return lista.slice(0, 10);
}

const DnaIa = z.object({
  tom: z.object({
    adjetivos: z.array(z.string().trim().min(1).max(40)).max(5),
    descricao: z.string().trim().max(400),
    exemplos: z.array(z.string().trim().min(1).max(200)).max(3),
  }),
  publico: z.string().trim().max(400),
  proposta: z.string().trim().max(400),
  pilares: z.array(z.string().trim().min(1).max(120)).max(5),
  usar: z.array(z.string().trim().min(1).max(40)).max(10),
  evitar: z.array(z.string().trim().min(1).max(40)).max(10),
});

async function acaoDna(ctx: Parameters<typeof gerarJson>[0], corpo: Record<string, unknown>) {
  if ((await papelNaConta(ctx.db, ctx.contaId, ctx.userId)) !== "dono") throw new ErroUsuario("Só o dono da conta lê o DNA da marca.", 403);
  const bruto = z.string().trim().min(4).max(500).parse(corpo.url);
  const inicio = /^https?:\/\//.test(bruto) ? bruto : `https://${bruto}`;
  const pagina = await buscar(inicio, "text/html", 2_000_000);
  if (!pagina || !/html/i.test(pagina.tipo)) throw new ErroUsuario("Não consegui abrir o site. Confira o endereço (precisa ser público).");
  const base = new URL(pagina.url);
  const html = texto(pagina.bytes);

  // CSS: <style> da página + até 4 folhas de estilo do próprio site.
  let css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  css += [...html.matchAll(/style=["']([^"']+)["']/gi)].map((m) => m[1]).join(";");
  const folhas = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)]
    .map((m) => /href=["']([^"']+)["']/i.exec(m[0])?.[1]).filter(Boolean)
    .map((h) => { try { return new URL(decodificar(h!), base); } catch { return null; } })
    .filter((u): u is URL => !!u && !/fonts\.googleapis/.test(u.hostname)).slice(0, 4);
  for (const f of folhas) {
    const r = await buscar(f.toString(), "text/css", 600_000);
    if (r) css += "\n" + texto(r.bytes);
  }
  const temaCor = meta(html, "theme-color") || null;

  // Textos: página inicial + até 3 páginas internas do menu.
  const internas = [...new Set([...html.matchAll(/<a[^>]+href=["']([^"'#?]+)["']/gi)]
    .map((m) => { try { return new URL(decodificar(m[1]), base); } catch { return null; } })
    .filter((u): u is URL => !!u && u.hostname === base.hostname && u.pathname.split("/").filter(Boolean).length === 1)
    .map((u) => u.toString()))].slice(0, 3);
  const textos = [await lerLink(pagina.url).catch(() => null), ...(await Promise.all(internas.map((u) => lerLink(u).catch(() => null))))]
    .filter(Boolean) as Awaited<ReturnType<typeof lerLink>>[];
  if (!textos.length) throw new ErroUsuario("O site não tem texto legível (talvez seja todo montado por JavaScript).", 422);

  const instrucao = `Você analisa o site de uma empresa e descreve o DNA da marca para quem vai criar posts no Instagram.
Use SOMENTE o que está nos textos. O que o site não disser fica vazio ("" ou []): não invente público, números, nem promessas.
tom.adjetivos: até 5 adjetivos do jeito de escrever. tom.exemplos: até 3 frases curtas no estilo do site (podem ser trechos reais).
pilares: os temas que a empresa repete. usar: termos e expressões característicos. evitar: só o que o tom claramente rejeita.
Responda em JSON: {"tom": {"adjetivos": [], "descricao": "", "exemplos": []}, "publico": "", "proposta": "", "pilares": [], "usar": [], "evitar": []}.`;
  const pedido = textos.map((t) => `Página ${t.url}\nTítulo: ${t.titulo}\nDescrição: ${t.descricao}\nTexto: ${t.corpo.slice(0, 2500)}`).join("\n\n---\n\n");
  const ia = await gerarJson(ctx, DnaIa, instrucao, pedido);

  // Imagens: baixa até 8 e guarda no banco de mídias (pasta "Marca").
  const imagens: { midia_id: string; storage_path: string; origem: string }[] = [];
  for (const c of imagensDo(html, base)) {
    if (imagens.length >= 8) break;
    const r = await buscar(c.url, "image/*", 5_000_000);
    const mime = r?.tipo.split(";")[0].trim() ?? "";
    if (!r || !/^image\/(jpeg|png|webp|gif)$/.test(mime) || r.bytes.length < 2000) continue;
    const ext = mime.split("/")[1].replace("jpeg", "jpg");
    const caminho = `${ctx.contaId}/Marca/${crypto.randomUUID()}.${ext}`;
    const { error: eUp } = await ctx.db.storage.from("imobinsta-midias").upload(caminho, r.bytes, { contentType: mime });
    if (eUp) continue;
    const { data: m } = await ctx.db.from("midias").insert({
      conta_id: ctx.contaId, pasta: "Marca", tipo: c.origem === "logo" ? "logo" : "imagem", nome: (c.origem + " · " + base.hostname).slice(0, 80),
      storage_path: caminho, mime, tamanho_bytes: r.bytes.length, origem: "upload", criado_por: ctx.userId,
    }).select("id").single();
    if (m) imagens.push({ midia_id: m.id, storage_path: caminho, origem: c.origem });
  }

  const dna = {
    conta_id: ctx.contaId, site_url: pagina.url, cores: coresDo(css + html.slice(0, 200_000), temaCor), fontes: fontesDo(html, css),
    imagens, tom: ia.tom, publico: ia.publico || null, proposta: ia.proposta || null, pilares: ia.pilares, usar: ia.usar, evitar: ia.evitar,
    lido_em: new Date().toISOString(), editado_em: new Date().toISOString(),
  };
  const { error } = await ctx.db.from("marca_dna").upsert(dna);
  if (error) throw error;
  return { ...dna, paginas_lidas: textos.length };
}

// ---------- Ações ----------------------------------------------------------------------------

const Briefing = z.object({
  formato: z.enum(["post", "carrossel"]),
  n_slides: z.number().int().min(1).max(10),
  objetivo: z.enum(["engajar", "seguidores", "vender"]),
  produto: z.string().max(80),
  abordagem: z.string().max(40).optional(),
  origem: z.enum(["zero", "link", "pauta"]),
  ideia: z.string().max(2000).optional(),
  link: z.object({ url: z.string(), titulo: z.string().optional(), descricao: z.string().optional(), corpo: z.string().optional() }).optional(),
  instrucoes: z.string().max(2000).optional(),
  template: z.string().max(60),
  criar_automacao: z.boolean().optional(),
});

const OBJETIVO = { engajar: "Engajar (interação e comunidade)", seguidores: "Ganhar seguidores (compartilhamento e salvamento)", vender: "Vender (converter quem comenta em cliente, com automação no direct)" };

function textoBriefing(b: z.infer<typeof Briefing>) {
  return [
    `Formato: ${b.formato === "carrossel" ? `carrossel de ${b.n_slides} slides` : "post único (1 slide)"}, 1080×1350.`,
    `Objetivo: ${OBJETIVO[b.objetivo]}.`,
    `Produto: ${b.produto}.`,
    b.abordagem && `Abordagem: ${b.abordagem}.`,
    `Template visual: ${b.template}.`,
    b.ideia && `Ideia do usuário: ${b.ideia}`,
    b.link && `Conteúdo do link ${b.link.url}:\nTítulo: ${b.link.titulo ?? ""}\nDescrição: ${b.link.descricao ?? ""}\nTrecho: ${(b.link.corpo ?? "").slice(0, 2500)}`,
    b.instrucoes && `Instruções extras: ${b.instrucoes}`,
    b.criar_automacao && `O CTA final deve pedir para comentar a palavra QUERO (a automação do direct entrega o material).`,
  ].filter(Boolean).join("\n");
}

async function acaoPrompt(ctx: Parameters<typeof gerarJson>[0], corpo: Record<string, unknown>) {
  const b = Briefing.parse(corpo.briefing);
  const base = typeof corpo.base === "string" ? corpo.base.slice(0, 4000) : "";
  const instrucao = `${MARCA}
Você é estrategista de conteúdo para Instagram. Monte um "prompt adaptado" que vai guiar a criação dos slides e da legenda.
Use exatamente estas seções, cada uma com marcadores "• ":
**Objetivo do post:**, **Tom de voz:**, **Headline (slide 1):**, **Slides 2 a N:** (um marcador por slide, só se for carrossel),
**CTA (último slide):**.
Responda em JSON: {"prompt": "<texto com quebras de linha \\n>"}.`;
  const pedido = base
    ? `Briefing:\n${textoBriefing(b)}\n\nPrompt atual (melhore: headline mais forte, dor mais concreta, CTA mais claro; mantenha as seções):\n${base}`
    : `Briefing:\n${textoBriefing(b)}`;
  return await gerarJson(ctx, PromptAdaptado, instrucao, pedido);
}

async function acaoGerar(ctx: Parameters<typeof gerarJson>[0], corpo: Record<string, unknown>) {
  const prompt = z.string().min(10).max(6000).parse(corpo.prompt);
  const n = z.number().int().min(1).max(10).parse(corpo.n_slides);
  const instrucao = `${MARCA}
Você preenche templates HTML de slides do Instagram. Não descreve imagens: só escreve os campos de texto.
Cada slide segue este formato:
${FORMATO_SLIDE}
Regras: exatamente ${n} slide(s). O primeiro usa layout "capa" (headline forte, até 12 palavras). ${n > 1 ? 'O último usa layout "cta". Os do meio usam "lista" ou "grade" (grade = até 8 itens curtos, 1 a 3 palavras cada).' : 'Inclua o CTA no campo "cta" da capa.'}
Textos curtos: o slide tem de ser lido em 3 segundos. Não invente números, clientes nem resultados.
Legenda: até 1.800 caracteres, gancho na primeira linha, parágrafos curtos, um único pedido de ação, SEM hashtags no texto.
Hashtags: de 3 a 5, separadas, cada uma começando com #.
Responda em JSON: {"slides": [...], "legenda": "...", "hashtags": ["#..."]}.`;
  const r = await gerarJson(ctx, Geracao, instrucao, `Prompt adaptado:\n${prompt}`);
  return { ...r, slides: r.slides.slice(0, n) };
}

async function acaoEditar(ctx: Parameters<typeof gerarJson>[0], corpo: Record<string, unknown>) {
  const pedido = z.string().min(2).max(800).parse(corpo.pedido);
  const slide = JSON.stringify(corpo.slide ?? {}).slice(0, 4000);
  const n = Number(corpo.n) || 1;
  const total = Number(corpo.total) || 1;
  const instrucao = `${MARCA}
Você edita um slide de um template HTML do Instagram. Só pode mudar estes campos:
${FORMATO_SLIDE}
Devolva só os campos que mudam em "alteracoes" e uma frase curta em "resposta" dizendo o que fez.
Se o pedido for impossível no template (ex.: gerar foto), não altere nada e explique em "resposta".
Responda em JSON: {"alteracoes": {...}, "resposta": "..."}.`;
  return await gerarJson(ctx, Edicao, instrucao, `Slide ${n} de ${total}, JSON atual:\n${slide}\n\nPedido: ${pedido}`);
}

// ---------- Recomendações IA do calendário (Fase 6) ------------------------------------------

const PRODUTOS = [
  "Ecossistema completo", "ERP + TOTVS RM", "Imobiliárias", "Portal de compras", "Helpdesk",
  "Cobrança + assinatura", "Aprovações / RH", "Confeitarias",
] as const;
const SEMANAS = 4;
const POR_SEMANA = 2;
const DIAS = [2, 5]; // terça e sexta

const Sugestoes = z.object({
  pautas: z.array(z.object({
    titulo: z.string().trim().min(3).max(140),
    produto: z.enum(PRODUTOS),
    formato: z.enum(["post", "carrossel", "reels"]),
    notas: z.string().trim().max(500),
  })).min(SEMANAS * POR_SEMANA),
});

/** AAAA-MM-DD + n dias, sem passar por fuso. */
function somarDias(data: string, n: number) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Ranking real da Fase 2: alcance do retrato mais recente de cada post publicado (top 10). */
async function rankingAlcance(db: Db, contaId: string) {
  const { data: posts, error } = await db.from("posts")
    .select("formato, legenda, publicado_em, metricas_post(data, alcance)")
    .eq("conta_id", contaId).eq("status", "publicado");
  if (error) throw error;
  type Linha = { formato: string; legenda: string | null; publicado_em: string | null; metricas_post: { data: string; alcance: number | null }[] };
  return ((posts ?? []) as Linha[])
    .map((p) => ({
      formato: p.formato,
      titulo: (p.legenda ?? "").split("\n").find((l) => l.trim() && !l.trim().startsWith("#"))?.trim().slice(0, 120) ?? "",
      alcance: [...(p.metricas_post ?? [])].sort((a, b) => b.data.localeCompare(a.data))[0]?.alcance ?? null,
    }))
    .filter((p) => p.alcance != null)
    .sort((a, b) => b.alcance! - a.alcance!)
    .slice(0, 10);
}

function textoRanking(ranking: Awaited<ReturnType<typeof rankingAlcance>>) {
  return ranking.length
    ? `Ranking dos posts por alcance (dado real do Instagram):\n${ranking.map((p, i) => `${i + 1}. [${p.formato}] alcance ${p.alcance} · "${p.titulo}"`).join("\n")}`
    : "Ranking vazio: a conta ainda não tem métricas de alcance.";
}

// ---------- Campanhas sugeridas (Fase 10) ---------------------------------------------------------

const PostCampanha = z.object({
  titulo: z.string().trim().min(3).max(140),
  formato: z.enum(["post", "carrossel", "reels"]),
  produto: z.enum(PRODUTOS),
  notas: z.string().trim().max(500),
});
const Campanhas = z.object({
  campanhas: z.array(z.object({
    nome: z.string().trim().min(3).max(120),
    objetivo: z.enum(["engajar", "seguidores", "vender"]),
    publico: z.string().trim().max(300),
    descricao: z.string().trim().max(1000),
    semanas: z.number().int().min(2).max(4),
    posts: z.array(PostCampanha).min(4).max(8),
  })).min(3).max(3),
});

async function acaoCampanhas(ctx: Parameters<typeof gerarJson>[0]) {
  const ranking = await rankingAlcance(ctx.db, ctx.contaId);
  const instrucao = `${MARCA}
Você é estrategista de marketing no Instagram. Proponha EXATAMENTE 3 campanhas diferentes entre si (uma de cada objetivo:
engajar, seguidores, vender). Cada campanha dura de 2 a 4 semanas e tem de 4 a 8 posts (2 por semana), alternando formato.
Use o DNA da marca e o ranking de alcance. Em "notas" de cada post, 1 frase do porquê, citando SOMENTE números do ranking.
Produtos permitidos (texto exato): ${PRODUTOS.join(" | ")}.
Responda em JSON: {"campanhas": [{"nome": "", "objetivo": "engajar|seguidores|vender", "publico": "", "descricao": "", "semanas": 2,
"posts": [{"titulo": "", "formato": "carrossel|reels|post", "produto": "", "notas": ""}]}]}.`;
  const r = await gerarJson(ctx, Campanhas, instrucao, textoRanking(ranking));
  const linhas = r.campanhas.map((c) => ({
    conta_id: ctx.contaId, nome: c.nome, objetivo: c.objetivo, publico: c.publico || null, descricao: c.descricao || null,
    semanas: c.semanas, posts_json: c.posts.slice(0, c.semanas * POR_SEMANA), status: "sugerida", origem: "ia",
  }));
  const { data, error } = await ctx.db.from("campanhas").insert(linhas).select("id");
  if (error) throw error;
  return { criadas: data?.length ?? 0, com_ranking: ranking.length };
}

/** Aprova: as sugestões viram pautas (terça e sexta) a partir da segunda-feira escolhida. */
async function acaoAprovarCampanha(ctx: Parameters<typeof gerarJson>[0], corpo: Record<string, unknown>) {
  const id = z.string().uuid().parse(corpo.campanha_id);
  const inicio = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(corpo.inicio);
  if (new Date(`${inicio}T12:00:00Z`).getUTCDay() !== 1) throw new ErroUsuario("O início precisa ser uma segunda-feira.");
  // Reserva atômica: dois cliques não criam as pautas duas vezes.
  const { data: c, error } = await ctx.db.from("campanhas").update({ status: "aprovada", inicio })
    .eq("id", id).eq("conta_id", ctx.contaId).eq("status", "sugerida").select("posts_json, semanas").maybeSingle();
  if (error) throw error;
  if (!c) throw new ErroUsuario("Campanha não encontrada ou já aprovada.", 409);
  const posts = z.array(PostCampanha).parse(c.posts_json);
  const pautas = posts.map((p, i) => ({
    conta_id: ctx.contaId, campanha_id: id, origem: "ia",
    data: somarDias(inicio, Math.floor(i / POR_SEMANA) * 7 + DIAS[i % POR_SEMANA] - 1),
    titulo: p.titulo, produto: p.produto, formato: p.formato, notas: p.notas || null,
  }));
  const { error: eIns } = await ctx.db.from("pautas").insert(pautas);
  if (eIns) {
    await ctx.db.from("campanhas").update({ status: "sugerida", inicio: null }).eq("id", id);
    throw eIns;
  }
  const fim = pautas.at(-1)?.data ?? inicio;
  await ctx.db.from("campanhas").update({ fim }).eq("id", id);
  return { pautas: pautas.length, inicio, fim };
}

async function acaoPautas(ctx: Parameters<typeof gerarJson>[0], corpo: Record<string, unknown>) {
  // inicio = segunda-feira da primeira semana (o front manda a próxima segunda no fuso do usuário)
  const inicio = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(corpo.inicio);
  if (new Date(`${inicio}T12:00:00Z`).getUTCDay() !== 1) throw new ErroUsuario("O início precisa ser uma segunda-feira.");
  const fim = somarDias(inicio, SEMANAS * 7 - 1);

  const { count } = await ctx.db.from("pautas").select("id", { count: "exact", head: true })
    .eq("conta_id", ctx.contaId).eq("origem", "ia").gte("data", inicio).lte("data", fim);
  if ((count ?? 0) > 0) throw new ErroUsuario("Já existem sugestões da IA nessas 4 semanas. Apague-as no calendário para gerar de novo.", 409);

  const ranking = await rankingAlcance(ctx.db, ctx.contaId);
  const n = SEMANAS * POR_SEMANA;
  const instrucao = `${MARCA}
Você é estrategista de conteúdo para Instagram e monta o calendário das próximas ${SEMANAS} semanas: ${n} pautas, ${POR_SEMANA} por semana, na ordem em que vão ao ar.
Regras: alterne o produto (não repita o mesmo produto em pautas seguidas e cubra pelo menos 5 produtos diferentes) e alterne o formato (carrossel, reels, post).
Use o ranking de alcance para decidir temas e formatos que repetir. Em "notas", explique em 1 ou 2 frases por que a pauta faz sentido,
citando SOMENTE os posts e números do ranking fornecido. Se o ranking estiver vazio, diga que é uma aposta inicial, sem inventar números.
Produtos permitidos (use o texto exato): ${PRODUTOS.join(" | ")}.
Responda em JSON: {"pautas": [{"titulo": "...", "produto": "...", "formato": "carrossel|reels|post", "notas": "..."}]}.`;
  const r = await gerarJson(ctx, Sugestoes, instrucao, textoRanking(ranking));

  const linhas = r.pautas.slice(0, n).map((p, i) => ({
    conta_id: ctx.contaId,
    data: somarDias(inicio, Math.floor(i / POR_SEMANA) * 7 + DIAS[i % POR_SEMANA] - 1),
    titulo: p.titulo, produto: p.produto, formato: p.formato, notas: p.notas || null, origem: "ia",
  }));
  const { data: criadas, error: eIns } = await ctx.db.from("pautas").insert(linhas).select("id, data");
  if (eIns) throw eIns;
  return { criadas: criadas?.length ?? 0, inicio, fim, com_ranking: ranking.length };
}

// ---------- Roteiro de vídeo com avatar (Fase 7.2) -------------------------------------------

const Roteiro = z.object({
  titulo: z.string().trim().min(3).max(160),
  texto: z.string().trim().min(20).max(3000),
  legenda: z.string().trim().min(1).max(1800),
  hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]+$/u)).max(5),
});

async function acaoRoteiro(ctx: Parameters<typeof gerarJson>[0], corpo: Record<string, unknown>) {
  const tema = z.string().trim().min(10).max(1500).parse(corpo.tema);
  const produto = z.enum(PRODUTOS).parse(corpo.produto);
  const segundos = z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90)]).parse(corpo.segundos);
  const palavras = Math.round((segundos / 60) * 150);
  const instrucao = `${MARCA}
Você escreve roteiros de Reels falados por um avatar (apresentador em vídeo, olhando para a câmera).
O texto é lido em voz alta: frases curtas, linguagem falada, sem emojis, sem hashtags, sem marcadores, sem indicação de cena.
Estrutura: gancho forte nos primeiros 3 segundos, a dor do cliente, a solução da WSA, e um único pedido de ação no fim
(comentar a palavra QUERO para receber no direct). Cerca de ${palavras} palavras (≈ ${segundos} segundos). Não invente números, clientes nem resultados.
Legenda do post: até 1.200 caracteres, sem hashtags no texto. Hashtags: de 3 a 5.
Responda em JSON: {"titulo": "...", "texto": "<o que o avatar fala>", "legenda": "...", "hashtags": ["#..."]}.`;
  return await gerarJson(ctx, Roteiro, instrucao, `Produto: ${produto}\nTema: ${tema}`);
}

async function acaoChave(db: Db, contaId: string, userId: string, corpo: Record<string, unknown>) {
  if ((await papelNaConta(db, contaId, userId)) !== "dono") throw new ErroUsuario("Só o dono da conta pode trocar a chave.", 403);
  const chave = z.string().trim().min(20).max(200).parse(corpo.chave);
  const teste = await fetch(`${GEMINI}/models?pageSize=1`, { headers: { "x-goog-api-key": chave } });
  if (!teste.ok) throw new ErroUsuario("O Google recusou esta chave. Confira no AI Studio e cole de novo.");

  let id = await conexaoGemini(db, contaId);
  if (!id) {
    const { data, error } = await db.from("conexoes").insert({ conta_id: contaId, provedor: "gemini" }).select("id").single();
    if (error) throw error;
    id = data.id as string;
  }
  const { error: eSeg } = await db.rpc("salvar_segredo_conexao", { p_conexao: id, p_valor: chave });
  if (eSeg) throw eSeg;
  const { error } = await db.from("conexoes").update({
    status: "conectado", detalhe: `Legendas, prompts e edição por chat · ${MODELO}`, atualizado_em: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;
  return { ok: true };
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

    const postId = typeof corpo.post_id === "string" ? corpo.post_id : undefined;
    if (postId) {
      const { data } = await db.from("posts").select("id").eq("id", postId).eq("conta_id", contaId).maybeSingle();
      if (!data) return json({ erro: "Post não encontrado nesta conta." }, 404);
    }
    const ctx = { db, contaId, userId: user.id, postId, acao: String(corpo.acao) };

    switch (corpo.acao) {
      case "link":
        return json(await lerLink(z.string().max(2000).parse(corpo.url)));
      case "prompt":
        return json(await acaoPrompt(ctx, corpo));
      case "gerar":
        return json(await acaoGerar(ctx, corpo));
      case "editar":
        return json(await acaoEditar(ctx, corpo));
      case "pautas":
        return json(await acaoPautas(ctx, corpo));
      case "roteiro":
        return json(await acaoRoteiro(ctx, corpo));
      case "dna":
        return json(await acaoDna(ctx, corpo));
      case "campanhas":
        return json(await acaoCampanhas(ctx));
      case "aprovar_campanha":
        return json(await acaoAprovarCampanha(ctx, corpo));
      case "chave":
        return json(await acaoChave(db, contaId, user.id, corpo));
      default:
        return json({ erro: "Ação desconhecida." }, 400);
    }
  } catch (e) {
    if (e instanceof ErroUsuario) return json({ erro: e.message }, e.status);
    if (e instanceof z.ZodError) return json({ erro: `Dados inválidos: ${e.issues[0]?.path.join(".")} ${e.issues[0]?.message}` }, 400);
    console.error("ia-texto", e);
    // PostgrestError não é instanceof Error, mas traz message. Nenhum dos dois carrega segredo.
    const detalhe = (e as { message?: string })?.message;
    return json({ erro: detalhe ? `Falha na IA de texto: ${detalhe.slice(0, 300)}` : "Falha inesperada na IA de texto. Tente de novo." }, 500);
  }
});
