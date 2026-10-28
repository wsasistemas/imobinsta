import { supabase } from "@/lib/supabase";
import { BUCKET } from "@/features/midias/envio";

/**
 * Motor do Reels montado no navegador (Fase 12.2). Cada quadro é desenhado num canvas 1080×1920 e codificado com
 * WebCodecs; o Mediabunny monta o MP4 (H.264 + AAC). Custo zero. Chrome e Edge.
 * O Mediabunny é carregado sob demanda (import dinâmico) para não pesar nas outras telas.
 */
export const LARGURA_V = 1080;
export const ALTURA_V = 1920;
export const FPS = 30;
export const MAX_SEGUNDOS = 90;
export const MAX_CENAS = 20;
const ESMAECER = 0.3; // s de escurecimento no fim e no começo de cada cena
const TAXA_AUDIO = 48000;

export type Cena = {
  id: string;
  tipo: "foto" | "video" | "cta";
  midia: { storage_path: string; nome: string; duracao_s: number | null } | null; // foto ou vídeo do Banco
  texto: string;
  posicao: "topo" | "centro" | "base";
  movimento: "zoom" | "panoramica" | "parado"; // só foto
  duracao: number; // s, foto e CTA
  inicio: number; // s, corte do vídeo
  fim: number;
  som: boolean; // som original do vídeo
};

export type Projeto = {
  cenas: Cena[];
  trilha: { storage_path: string; nome: string } | null;
  logo: string | null; // caminho no bucket
  transicao: "corte" | "esmaecer";
  legendaGrande: boolean;
  cor: string; // fundo da cena de CTA (cor principal do DNA)
};

export function duracaoDa(c: Cena) {
  return c.tipo === "video" ? Math.max(0.5, c.fim - c.inicio) : c.duracao;
}

export function duracaoTotal(p: Projeto) {
  return p.cenas.reduce((s, c) => s + duracaoDa(c), 0);
}

/** Cena em que cai o instante `t` e o tempo dentro dela. */
export function cenaNoTempo(p: Projeto, t: number) {
  let ini = 0;
  for (const [i, c] of p.cenas.entries()) {
    const d = duracaoDa(c);
    if (t < ini + d || i === p.cenas.length - 1) return { i, cena: c, local: Math.min(Math.max(0, t - ini), d), inicio: ini };
    ini += d;
  }
  return null;
}

export function cenaDeMidia(m: { storage_path: string; nome: string; tipo: string; duracao_s: number | null }): Cena {
  const video = m.tipo === "video";
  return {
    id: crypto.randomUUID(), tipo: video ? "video" : "foto", midia: { storage_path: m.storage_path, nome: m.nome, duracao_s: m.duracao_s },
    texto: "", posicao: "base", movimento: "zoom", duracao: 4, inicio: 0, fim: video ? Math.min(m.duracao_s ?? 6, 8) : 0, som: false,
  };
}

export function cenaDeCta(texto = "Comente QUERO e receba no direct"): Cena {
  return { id: crypto.randomUUID(), tipo: "cta", midia: null, texto, posicao: "centro", movimento: "parado", duracao: 4, inicio: 0, fim: 0, som: false };
}

/** O navegador gera MP4? Vídeo H.264 é obrigatório; sem AAC o vídeo sai sem som. */
export async function suporte() {
  if (typeof VideoEncoder === "undefined") return { video: false, audio: false };
  const { canEncodeAudio, canEncodeVideo } = await import("mediabunny");
  const [video, audio] = await Promise.all([
    canEncodeVideo("avc", { width: LARGURA_V, height: ALTURA_V, frameRate: FPS }).catch(() => false),
    typeof AudioEncoder === "undefined" ? false : canEncodeAudio("aac", { numberOfChannels: 2, sampleRate: TAXA_AUDIO }).catch(() => false),
  ]);
  return { video, audio };
}

/**
 * Mídias baixadas do bucket privado como blob (o canvas não fica "sujo" por CORS). Fotos viram ImageBitmap reduzido
 * (o suficiente para o zoom em 1080×1920); vídeos viram <video> com link local, um por caminho.
 */
export class Recursos {
  private blobs = new Map<string, Promise<Blob>>();
  private fotos = new Map<string, ImageBitmap>();
  private videos = new Map<string, HTMLVideoElement>();

  private blob(caminho: string) {
    let b = this.blobs.get(caminho);
    if (!b) {
      b = supabase.storage.from(BUCKET).download(caminho).then(({ data, error }) => {
        if (error || !data) throw new Error("Não foi possível baixar uma mídia do Banco.");
        return data;
      });
      b.catch(() => this.blobs.delete(caminho));
      this.blobs.set(caminho, b);
    }
    return b;
  }

  async carregarFoto(caminho: string) {
    if (this.fotos.has(caminho)) return;
    const original = await createImageBitmap(await this.blob(caminho));
    // Cobre 1080×1920 com folga de 15% para o zoom; acima disso, reduz (memória).
    const escala = Math.max((LARGURA_V * 1.15) / original.width, (ALTURA_V * 1.15) / original.height);
    if (escala >= 1) {
      this.fotos.set(caminho, original);
      return;
    }
    const menor = await createImageBitmap(original, {
      resizeWidth: Math.round(original.width * escala), resizeHeight: Math.round(original.height * escala), resizeQuality: "high",
    });
    original.close();
    this.fotos.set(caminho, menor);
  }

  async carregarVideo(caminho: string) {
    if (this.videos.has(caminho)) return;
    const el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.preload = "auto";
    el.src = URL.createObjectURL(await this.blob(caminho));
    await new Promise<void>((ok, falha) => {
      el.onloadeddata = () => ok();
      el.onerror = () => falha(new Error("O navegador não abriu um dos vídeos (use MP4 H.264)."));
    });
    this.videos.set(caminho, el);
  }

  async carregar(p: Projeto) {
    const tarefas: Promise<void>[] = [];
    for (const c of p.cenas) {
      if (c.tipo === "foto" && c.midia) tarefas.push(this.carregarFoto(c.midia.storage_path));
      if (c.tipo === "video" && c.midia) tarefas.push(this.carregarVideo(c.midia.storage_path));
    }
    if (p.logo) tarefas.push(this.carregarFoto(p.logo));
    await Promise.all(tarefas);
  }

  foto(caminho: string) {
    return this.fotos.get(caminho) ?? null;
  }

  video(caminho: string) {
    return this.videos.get(caminho) ?? null;
  }

  /** Áudio decodificado (trilha ou som do vídeo). null se o arquivo não tiver áudio. */
  async audio(caminho: string, ctx: BaseAudioContext) {
    const dados = await (await this.blob(caminho)).arrayBuffer();
    return ctx.decodeAudioData(dados).catch(() => null);
  }

  liberar() {
    for (const f of this.fotos.values()) f.close();
    for (const v of this.videos.values()) URL.revokeObjectURL(v.src);
    this.fotos.clear();
    this.videos.clear();
    this.blobs.clear();
  }
}

/** Leva o vídeo ao instante pedido e espera o quadro ficar pronto. */
async function buscar(el: HTMLVideoElement, t: number) {
  const alvo = Math.min(Math.max(0, t), Math.max(0, el.duration - 0.05));
  if (Math.abs(el.currentTime - alvo) < 0.001 && el.readyState >= 2) return;
  await new Promise<void>((ok) => {
    const desiste = setTimeout(ok, 3000);
    el.addEventListener("seeked", () => { clearTimeout(desiste); ok(); }, { once: true });
    el.currentTime = alvo;
  });
}

/** Desenha a fonte cobrindo a tela (como object-fit: cover), com zoom e deslocamento horizontal (-1 a 1). */
function cobrir(ctx: CanvasRenderingContext2D, fonte: CanvasImageSource, lf: number, af: number, zoom = 1, desloca = 0) {
  const escala = Math.max(LARGURA_V / lf, ALTURA_V / af) * zoom;
  const l = lf * escala;
  const a = af * escala;
  const sobra = (l - LARGURA_V) / 2;
  ctx.drawImage(fonte, (LARGURA_V - l) / 2 + desloca * sobra, (ALTURA_V - a) / 2, l, a);
}

function quebrarLinhas(ctx: CanvasRenderingContext2D, texto: string, largura: number) {
  const linhas: string[] = [];
  for (const paragrafo of texto.split("\n")) {
    let linha = "";
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const teste = linha ? `${linha} ${palavra}` : palavra;
      if (ctx.measureText(teste).width > largura && linha) {
        linhas.push(linha);
        linha = palavra;
      } else linha = teste;
    }
    linhas.push(linha);
  }
  return linhas;
}

const FONTE = '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, "Segoe UI", system-ui, sans-serif';

/** Texto da cena numa caixa escura arredondada. As faixas evitam a área que o Instagram cobre (base e direita). */
function desenharTexto(ctx: CanvasRenderingContext2D, texto: string, posicao: Cena["posicao"], grande: boolean, cta = false) {
  const tamanho = cta ? 88 : grande ? 72 : 56;
  ctx.font = `800 ${tamanho}px ${FONTE}`;
  const altLinha = Math.round(tamanho * 1.18);
  const linhas = quebrarLinhas(ctx, texto, 860).slice(0, cta ? 7 : 5);
  const pad = 36;
  const largura = Math.min(940, Math.max(...linhas.map((l) => ctx.measureText(l).width)) + pad * 2);
  const altura = linhas.length * altLinha + pad * 2 - (altLinha - tamanho);
  const y = posicao === "topo" ? 230 : posicao === "centro" ? (ALTURA_V - altura) / 2 : ALTURA_V - 470 - altura;
  const x = (LARGURA_V - largura) / 2;
  if (!cta) {
    ctx.fillStyle = "rgba(0,0,0,0.58)";
    ctx.beginPath();
    ctx.roundRect(x, y, largura, altura, 28);
    ctx.fill();
  }
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  linhas.forEach((l, i) => ctx.fillText(l, LARGURA_V / 2, y + pad + i * altLinha));
}

function clarear(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(Math.min(255, v + (255 - v) * f));
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}

async function desenharCena(ctx: CanvasRenderingContext2D, p: Projeto, r: Recursos, c: Cena, local: number) {
  const d = duracaoDa(c);
  const prog = d > 0 ? local / d : 0;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, LARGURA_V, ALTURA_V);
  if (c.tipo === "foto" && c.midia) {
    const f = r.foto(c.midia.storage_path);
    if (f) {
      if (c.movimento === "zoom") cobrir(ctx, f, f.width, f.height, 1 + 0.12 * prog);
      else if (c.movimento === "panoramica") cobrir(ctx, f, f.width, f.height, 1.12, -1 + 2 * prog);
      else cobrir(ctx, f, f.width, f.height);
    }
  } else if (c.tipo === "video" && c.midia) {
    const v = r.video(c.midia.storage_path);
    if (v) {
      await buscar(v, c.inicio + local);
      cobrir(ctx, v, v.videoWidth, v.videoHeight);
    }
  } else if (c.tipo === "cta") {
    const g = ctx.createLinearGradient(0, 0, LARGURA_V, ALTURA_V);
    g.addColorStop(0, p.cor);
    g.addColorStop(1, clarear(p.cor, 0.35));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LARGURA_V, ALTURA_V);
  }
  if (c.texto.trim()) desenharTexto(ctx, c.texto.trim(), c.tipo === "cta" ? "centro" : c.posicao, p.legendaGrande, c.tipo === "cta");
}

/** Desenha o quadro do instante `t` (s) do vídeo inteiro. */
export async function desenharQuadro(ctx: CanvasRenderingContext2D, p: Projeto, r: Recursos, t: number) {
  const atual = cenaNoTempo(p, t);
  if (!atual) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, LARGURA_V, ALTURA_V);
    return;
  }
  await desenharCena(ctx, p, r, atual.cena, atual.local);
  const logo = p.logo ? r.foto(p.logo) : null;
  if (logo) {
    const escala = Math.min(170 / logo.width, 170 / logo.height);
    const l = logo.width * escala;
    ctx.drawImage(logo, LARGURA_V - 64 - l, 96, l, logo.height * escala);
  }
  if (p.transicao === "esmaecer" && p.cenas.length > 1) {
    const d = duracaoDa(atual.cena);
    const primeira = atual.i === 0;
    const ultima = atual.i === p.cenas.length - 1;
    const entrada = primeira ? 1 : Math.min(1, atual.local / ESMAECER);
    const saida = ultima ? 1 : Math.min(1, (d - atual.local) / ESMAECER);
    const escuro = 1 - Math.min(entrada, saida);
    if (escuro > 0) {
      ctx.fillStyle = `rgba(0,0,0,${escuro})`;
      ctx.fillRect(0, 0, LARGURA_V, ALTURA_V);
    }
  }
}

/** Trilha em loop com saída suave + som dos vídeos marcados, já no tempo do Reels. null se não houver som. */
async function mixarAudio(p: Projeto, r: Recursos, total: number) {
  const ctx = new OfflineAudioContext(2, Math.ceil(total * TAXA_AUDIO), TAXA_AUDIO);
  let algum = false;
  const comSom = p.cenas.some((c) => c.tipo === "video" && c.som);
  if (p.trilha) {
    const buf = await r.audio(p.trilha.storage_path, ctx);
    if (buf) {
      const fonte = ctx.createBufferSource();
      fonte.buffer = buf;
      fonte.loop = true;
      const ganho = ctx.createGain();
      const vol = comSom ? 0.35 : 0.9;
      ganho.gain.setValueAtTime(vol, 0);
      ganho.gain.setValueAtTime(vol, Math.max(0, total - 1.5));
      ganho.gain.linearRampToValueAtTime(0, total);
      fonte.connect(ganho).connect(ctx.destination);
      fonte.start(0);
      algum = true;
    }
  }
  let ini = 0;
  for (const c of p.cenas) {
    const d = duracaoDa(c);
    if (c.tipo === "video" && c.som && c.midia) {
      const buf = await r.audio(c.midia.storage_path, ctx);
      if (buf) {
        const fonte = ctx.createBufferSource();
        fonte.buffer = buf;
        fonte.connect(ctx.destination);
        fonte.start(ini, c.inicio, d);
        algum = true;
      }
    }
    ini += d;
  }
  return algum ? ctx.startRendering() : null;
}

/** Gera o MP4 quadro a quadro. `aoAvancar` recebe 0–1. `cancelado` interrompe entre quadros. */
export async function gerarMp4(p: Projeto, r: Recursos, op: { audio: boolean; aoAvancar: (f: number) => void; cancelado: () => boolean }) {
  const total = duracaoTotal(p);
  if (!p.cenas.length) throw new Error("Ponha pelo menos uma cena.");
  if (total > MAX_SEGUNDOS) throw new Error(`O Reels passou de ${MAX_SEGUNDOS} s. Encurte as cenas.`);
  await r.carregar(p);
  const { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH } = await import("mediabunny");
  const audio = op.audio ? await mixarAudio(p, r, total) : null;

  const canvas = document.createElement("canvas");
  canvas.width = LARGURA_V;
  canvas.height = ALTURA_V;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const saida = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: "avc", bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
  saida.addVideoTrack(video, { frameRate: FPS });
  const som = audio ? new AudioBufferSource({ codec: "aac", bitrate: 160_000 }) : null;
  if (som) saida.addAudioTrack(som);
  await saida.start();

  try {
    if (som && audio) await som.add(audio);
    const quadros = Math.round(total * FPS);
    for (let q = 0; q < quadros; q++) {
      if (op.cancelado()) throw new Error("Geração cancelada.");
      await desenharQuadro(ctx, p, r, q / FPS);
      await video.add(q / FPS, 1 / FPS);
      if (q % 15 === 0) op.aoAvancar(q / quadros);
    }
    await saida.finalize();
  } catch (e) {
    await saida.cancel().catch(() => undefined);
    throw e;
  }
  op.aoAvancar(1);
  return new Blob([saida.target.buffer!], { type: "video/mp4" });
}
