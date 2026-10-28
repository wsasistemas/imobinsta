import { toBlob } from "html-to-image";
import { supabase } from "@/lib/supabase";
import { BUCKET, enviarComProgresso } from "@/features/midias/envio";
import { ALTURA, type DadosSlide, LARGURA } from "./esquema";

/**
 * Imagem 1080×1350 do slide, renderizada no navegador a partir do próprio HTML do template. Custo zero.
 * PNG para baixar; JPEG para publicar (a API do Instagram só aceita JPEG).
 */
export async function imagemDoSlide(no: HTMLElement, tipo: "png" | "jpeg" = "png"): Promise<Blob> {
  const opcoes = {
    width: LARGURA, height: ALTURA, pixelRatio: 1, cacheBust: true, skipFonts: true, style: { transform: "none" },
    type: `image/${tipo}`, quality: 0.92, backgroundColor: "#000000",
  };
  // Espera as imagens do slide (logo e fundo da IA) decodificarem antes de copiar o HTML.
  await Promise.all([...no.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)));
  // A primeira passada às vezes sai sem as imagens (ainda carregando no clone); a segunda é a que vale.
  await toBlob(no, opcoes).catch(() => null);
  const blob = await toBlob(no, opcoes);
  if (!blob) throw new Error("Não foi possível gerar a imagem do slide.");
  return blob;
}

export function baixar(blob: Blob, nome: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Guarda a imagem no banco de mídias (origem "render") e liga ao slide.
 * Se o slide já tinha imagem renderizada, a antiga é apagada para não acumular arquivos.
 */
export async function salvarImagemDoSlide(p: {
  contaId: string; postId: string; slideId: string; ordem: number; pasta: string; blob: Blob; midiaAnterior: string | null;
}) {
  const id = crypto.randomUUID();
  const ext = p.blob.type === "image/jpeg" ? "jpg" : "png";
  const caminho = `${p.contaId}/render-${p.postId.slice(0, 8)}-${p.ordem}-${id.slice(0, 8)}.${ext}`;
  const arquivo = new File([p.blob], `slide-${p.ordem}.${ext}`, { type: p.blob.type });
  await enviarComProgresso(caminho, arquivo, () => {});
  const { data: midia, error } = await supabase
    .from("midias")
    .insert({
      conta_id: p.contaId, pasta: p.pasta, tipo: "imagem", nome: `Post ${p.postId.slice(0, 8)} · slide ${p.ordem}.${ext}`,
      storage_path: caminho, mime: p.blob.type, tamanho_bytes: p.blob.size, largura: LARGURA, altura: ALTURA, origem: "render",
    })
    .select("id")
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([caminho]);
    throw error;
  }
  const { error: eSl } = await supabase.from("post_slides").update({ midia_id: midia.id }).eq("id", p.slideId);
  if (eSl) throw eSl;

  await apagarRenderAnterior(p.midiaAnterior);
  return midia.id as string;
}

/** Apaga a imagem renderizada antiga do slide. Só origem "render": foto ou vídeo do Banco ligado ao slide nunca é apagado. */
async function apagarRenderAnterior(midiaAnterior: string | null) {
  if (midiaAnterior) {
    const { data: antiga } = await supabase.from("midias").select("storage_path, origem").eq("id", midiaAnterior).maybeSingle();
    if (antiga?.origem === "render") {
      await supabase.storage.from(BUCKET).remove([antiga.storage_path]);
      await supabase.from("midias").delete().eq("id", midiaAnterior);
    }
  }
}

/** Slide de vídeo (Fase 12): não vira JPEG; o slide aponta direto para o vídeo do Banco. */
async function ligarVideoAoSlide(slideId: string, caminho: string | undefined, midiaAnterior: string | null) {
  if (!caminho) throw new Error("Um slide de vídeo está sem vídeo. Escolha um no Banco de mídias.");
  const { data: video, error } = await supabase.from("midias").select("id, mime").eq("storage_path", caminho).single();
  if (error) throw new Error("O vídeo do slide não está mais no Banco de mídias.");
  if (video.mime !== "video/mp4" && video.mime !== "video/quicktime") throw new Error("O Instagram só aceita vídeo MP4 ou MOV no carrossel.");
  if (video.id !== midiaAnterior) {
    const { error: eSl } = await supabase.from("post_slides").update({ midia_id: video.id }).eq("id", slideId);
    if (eSl) throw eSl;
    await apagarRenderAnterior(midiaAnterior);
  }
  return video.id as string;
}

/** Gera o JPEG de cada slide (nós em tamanho real, fora da tela) e liga ao slide. Devolve os ids das mídias. */
export async function prepararImagens(p: {
  contaId: string; postId: string; pasta: string;
  slides: { id: string; midia_id: string | null; dados: DadosSlide }[]; nos: (HTMLElement | null)[];
  aoAvancar?: (feitos: number) => void;
}) {
  const ids: string[] = [];
  for (const [i, s] of p.slides.entries()) {
    if (s.dados.layout === "video") {
      ids.push(await ligarVideoAoSlide(s.id, s.dados.midia, s.midia_id));
      p.aoAvancar?.(i + 1);
      continue;
    }
    const no = p.nos[i];
    if (!no) throw new Error(`Slide ${i + 1} não encontrado.`);
    const blob = await imagemDoSlide(no, "jpeg");
    ids.push(await salvarImagemDoSlide({
      contaId: p.contaId, postId: p.postId, slideId: s.id, ordem: i + 1, pasta: p.pasta, blob, midiaAnterior: s.midia_id,
    }));
    p.aoAvancar?.(i + 1);
  }
  return ids;
}
