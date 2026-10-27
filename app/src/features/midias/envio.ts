import { chave, supabase, url } from "@/lib/supabase";

export const BUCKET = "imobinsta-midias";
export const LIMITE_BYTES = 100 * 1024 * 1024;

export type TipoMidia = "imagem" | "video" | "logo" | "trilha" | "print";
export type Dimensoes = { largura: number | null; altura: number | null; duracao_s: number | null };

/** Tipo automático pelo MIME; "logo" e "print" vêm da escolha do usuário. */
export function tipoPorMime(mime: string, escolha: "auto" | "logo" | "print"): TipoMidia | null {
  if (mime.startsWith("audio/")) return "trilha";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return escolha === "auto" ? "imagem" : escolha;
  return null;
}

/** Nome seguro para o caminho no Storage (sem acento, espaço ou barra). */
export function nomeSeguro(nome: string) {
  const [base, ext] = /^(.*?)(\.[^.]+)?$/.exec(nome)!.slice(1);
  const limpo = base.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "");
  return `${(limpo || "arquivo").slice(0, 60).toLowerCase()}${(ext ?? "").toLowerCase()}`;
}

/** Lê largura, altura e duração no navegador, antes de enviar. Falha silenciosa: tudo null. */
export function lerDimensoes(arquivo: File): Promise<Dimensoes> {
  const vazio: Dimensoes = { largura: null, altura: null, duracao_s: null };
  const src = URL.createObjectURL(arquivo);
  const fim = (d: Dimensoes) => {
    URL.revokeObjectURL(src);
    return d;
  };
  return new Promise((resolve) => {
    const desiste = setTimeout(() => resolve(fim(vazio)), 8000);
    const pronto = (d: Dimensoes) => {
      clearTimeout(desiste);
      resolve(fim(d));
    };
    if (arquivo.type.startsWith("image/")) {
      const img = new Image();
      img.onload = () => pronto({ largura: img.naturalWidth, altura: img.naturalHeight, duracao_s: null });
      img.onerror = () => pronto(vazio);
      img.src = src;
    } else if (arquivo.type.startsWith("video/") || arquivo.type.startsWith("audio/")) {
      const el = document.createElement(arquivo.type.startsWith("video/") ? "video" : "audio");
      el.preload = "metadata";
      el.onloadedmetadata = () =>
        pronto({
          largura: el instanceof HTMLVideoElement ? el.videoWidth || null : null,
          altura: el instanceof HTMLVideoElement ? el.videoHeight || null : null,
          duracao_s: Number.isFinite(el.duration) ? Math.round(el.duration * 100) / 100 : null,
        });
      el.onerror = () => pronto(vazio);
      el.src = src;
    } else {
      pronto(vazio);
    }
  });
}

/**
 * Envia para o Storage com progresso. O supabase-js não expõe progresso de upload,
 * então a chamada vai direto na API do Storage com o JWT do usuário (a RLS do bucket confere a conta).
 */
export async function enviarComProgresso(caminho: string, arquivo: File, onProgresso: (pct: number) => void) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre de novo.");

  const destino = `${url}/storage/v1/object/${BUCKET}/${caminho.split("/").map(encodeURIComponent).join("/")}`;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", destino);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", chave ?? "");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("Content-Type", arquivo.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgresso(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `Falha no envio (${xhr.status})`;
      try {
        const corpo = JSON.parse(xhr.responseText);
        msg = corpo.message ?? corpo.error ?? msg;
      } catch {
        /* resposta sem JSON */
      }
      if (xhr.status === 413 || /maximum allowed size|too large/i.test(msg)) {
        msg = "Arquivo acima do limite do projeto Supabase (o plano gratuito aceita até 50 MB).";
      }
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error("Sem conexão com o Supabase."));
    xhr.send(arquivo);
  });
}

export function tamanhoLegivel(bytes: number | null) {
  if (bytes == null) return "—";
  if (bytes === 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0).replace(".", ",")} MB`;
}
