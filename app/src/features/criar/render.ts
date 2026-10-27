import { toBlob } from "html-to-image";
import { supabase } from "@/lib/supabase";
import { BUCKET, enviarComProgresso } from "@/features/midias/envio";
import { ALTURA, LARGURA } from "./esquema";

/** PNG 1080×1350 do slide, renderizado no navegador a partir do próprio HTML do template. Custo zero. */
export async function pngDoSlide(no: HTMLElement): Promise<Blob> {
  const opcoes = { width: LARGURA, height: ALTURA, pixelRatio: 1, cacheBust: true, skipFonts: true, style: { transform: "none" } };
  // A primeira passada às vezes sai sem as imagens (ainda carregando no clone); a segunda é a que vale.
  await toBlob(no, opcoes).catch(() => null);
  const blob = await toBlob(no, opcoes);
  if (!blob) throw new Error("Não foi possível gerar o PNG do slide.");
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
 * Guarda o PNG no banco de mídias (origem "render") e liga ao slide.
 * Se o slide já tinha PNG, o antigo é apagado para não acumular arquivos.
 */
export async function salvarPngDoSlide(p: {
  contaId: string; postId: string; slideId: string; ordem: number; pasta: string; blob: Blob; midiaAnterior: string | null;
}) {
  const id = crypto.randomUUID();
  const caminho = `${p.contaId}/render-${p.postId.slice(0, 8)}-${p.ordem}-${id.slice(0, 8)}.png`;
  const arquivo = new File([p.blob], `slide-${p.ordem}.png`, { type: "image/png" });
  await enviarComProgresso(caminho, arquivo, () => {});
  const { data: midia, error } = await supabase
    .from("midias")
    .insert({
      conta_id: p.contaId, pasta: p.pasta, tipo: "imagem", nome: `Post ${p.postId.slice(0, 8)} · slide ${p.ordem}.png`,
      storage_path: caminho, mime: "image/png", tamanho_bytes: p.blob.size, largura: LARGURA, altura: ALTURA, origem: "render",
    })
    .select("id")
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([caminho]);
    throw error;
  }
  const { error: eSl } = await supabase.from("post_slides").update({ midia_id: midia.id }).eq("id", p.slideId);
  if (eSl) throw eSl;

  if (p.midiaAnterior) {
    const { data: antiga } = await supabase.from("midias").select("storage_path").eq("id", p.midiaAnterior).maybeSingle();
    if (antiga) {
      await supabase.storage.from(BUCKET).remove([antiga.storage_path]);
      await supabase.from("midias").delete().eq("id", p.midiaAnterior);
    }
  }
  return midia.id as string;
}
