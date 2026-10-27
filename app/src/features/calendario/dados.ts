import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAcesso } from "@/features/auth/acesso";

export type FormatoPauta = "post" | "carrossel" | "reels";

export type Pauta = {
  id: string;
  data: string; // AAAA-MM-DD (data pura, sem fuso)
  titulo: string;
  produto: string | null;
  formato: FormatoPauta;
  origem: "manual" | "ia";
  notas: string | null;
  post_id: string | null;
  posts: { status: string } | null;
};

export const FORMATO_PAUTA: Record<FormatoPauta, string> = { post: "Imagem", carrossel: "Carrossel", reels: "Reels" };

/** Data local no formato AAAA-MM-DD. Nunca use toISOString aqui: ela vira UTC e muda o dia à noite. */
export function chaveDia(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Converte AAAA-MM-DD em Date local (meia-noite no fuso do navegador). */
export function diaLocal(chave: string) {
  const [a, m, d] = chave.split("-").map(Number);
  return new Date(a, m - 1, d);
}

export function usePautas(inicio: string, fim: string) {
  const { demo, conta } = useAcesso();
  return useQuery({
    queryKey: ["pautas", conta?.conta_id, inicio, fim],
    enabled: !demo && !!conta,
    queryFn: async (): Promise<Pauta[]> => {
      const { data, error } = await supabase
        .from("pautas")
        .select("id, data, titulo, produto, formato, origem, notas, post_id, posts(status)")
        .eq("conta_id", conta!.conta_id)
        .gte("data", inicio)
        .lte("data", fim)
        .order("data");
      if (error) throw error;
      return (data ?? []) as unknown as Pauta[];
    },
  });
}

/** Uma pauta (para o wizard abrir já preenchido). */
export function usePauta(id: string | null) {
  const { demo } = useAcesso();
  return useQuery({
    queryKey: ["pauta", id],
    enabled: !!id && !demo,
    queryFn: async (): Promise<Pauta> => {
      const { data, error } = await supabase
        .from("pautas")
        .select("id, data, titulo, produto, formato, origem, notas, post_id, posts(status)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as Pauta;
    },
    staleTime: Infinity,
  });
}
