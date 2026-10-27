import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAcesso } from "@/features/auth/acesso";

/** DNA da marca (Fase 10): lido do site pela ia-texto (ação "dna") e editável pelo dono. */
export type Dna = {
  site_url: string | null;
  cores: string[];
  fontes: { titulo?: string; texto?: string };
  imagens: { midia_id: string; storage_path: string; origem: string }[];
  tom: { adjetivos?: string[]; descricao?: string; exemplos?: string[] };
  publico: string | null;
  proposta: string | null;
  pilares: string[];
  usar: string[];
  evitar: string[];
  lido_em: string | null;
  editado_em: string;
};

export function useDna() {
  const { conta, demo } = useAcesso();
  return useQuery({
    queryKey: ["marca-dna", conta?.conta_id],
    enabled: !!conta && !demo,
    staleTime: 5 * 60_000,
    retry: false, // todo slide usa (template "Marca"): sem DNA ou sem a tabela, não insiste
    queryFn: async (): Promise<Dna | null> => {
      const { data, error } = await supabase.from("marca_dna").select("*").eq("conta_id", conta!.conta_id).maybeSingle();
      if (error) throw error;
      return data as Dna | null;
    },
  });
}

/** Cor principal e de destaque do DNA (template "Marca"). Sem DNA, o azul da WSA. */
export function coresDaMarca(dna: Dna | null | undefined) {
  const [principal = "#0A4FD6", destaque] = dna?.cores ?? [];
  return { principal, destaque: destaque ?? principal };
}
