import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "@/features/auth/acesso";
import { supabase } from "@/lib/supabase";
import { BUCKET, type TipoMidia } from "./envio";

export type Midia = {
  id: string;
  pasta: string;
  tipo: TipoMidia;
  nome: string;
  storage_path: string;
  mime: string | null;
  tamanho_bytes: number | null;
  largura: number | null;
  altura: number | null;
  duracao_s: number | null;
  criado_em: string;
};
/** Mídias da conta com link assinado de 1 h (bucket privado). Também usado pelo seletor do editor. */
export function useMidias() {
  const { demo, conta } = useAcesso();
  return useQuery({
    queryKey: ["midias", conta?.conta_id],
    enabled: !demo && !!conta,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("midias")
        .select("id, pasta, tipo, nome, storage_path, mime, tamanho_bytes, largura, altura, duracao_s, criado_em")
        .eq("conta_id", conta!.conta_id)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      const lista = (data ?? []) as Midia[];
      // Links assinados de 1 h para as miniaturas (o bucket é privado).
      const urls = new Map<string, string>();
      if (lista.length) {
        const { data: assinadas } = await supabase.storage.from(BUCKET).createSignedUrls(lista.map((m) => m.storage_path), 3600);
        for (const a of assinadas ?? []) if (a.path && a.signedUrl) urls.set(a.path, a.signedUrl);
      }
      return lista.map((m) => ({ ...m, url: urls.get(m.storage_path) ?? null }));
    },
    staleTime: 30 * 60 * 1000,
  });
}
