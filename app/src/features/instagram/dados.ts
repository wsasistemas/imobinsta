import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAcesso } from "@/features/auth/acesso";

export type Formato = "post" | "carrossel" | "reels" | "stories";
export type StatusPost = "rascunho" | "agendado" | "publicando" | "publicado" | "erro";

export type Post = {
  id: string;
  formato: Formato;
  legenda: string | null;
  status: StatusPost;
  permalink: string | null;
  capa_url: string | null;
  publicado_em: string | null;
  agendado_para: string | null;
  pasta: string | null;
  curtidas: number | null;
  comentarios: number | null;
  /** Retrato mais recente das métricas (ig-sync). */
  alcance: number | null;
  views: number | null;
  salvamentos: number | null;
  compartilhamentos: number | null;
};

export type MetricaConta = { data: string; seguidores: number | null; seguindo: number | null; total_posts: number | null; alcance: number | null };

type Metrica = { data: string; alcance: number | null; views: number | null; salvamentos: number | null; compartilhamentos: number | null };

export const FORMATO_ROTULO: Record<Formato, string> = { post: "Imagem", carrossel: "Carrossel", reels: "Reels", stories: "Stories" };

/** Primeira linha da legenda, sem hashtags, para usar como título do post. */
export function tituloDoPost(p: Pick<Post, "legenda">) {
  const linha = (p.legenda ?? "").split("\n").find((l) => l.trim() && !l.trim().startsWith("#")) ?? "";
  return linha.trim() || "Sem legenda";
}

export function usePosts() {
  const { demo, conta } = useAcesso();
  return useQuery({
    queryKey: ["posts", conta?.conta_id],
    enabled: !demo && !!conta,
    queryFn: async (): Promise<Post[]> => {
      const { data, error } = await supabase
        .from("posts")
        .select(
          "id, formato, legenda, status, permalink, capa_url, publicado_em, agendado_para, pasta, curtidas, comentarios, metricas_post(data, alcance, views, salvamentos, compartilhamentos)",
        )
        .eq("conta_id", conta!.conta_id)
        .order("publicado_em", { ascending: false, nullsFirst: true });
      if (error) throw error;
      return (data ?? []).map(({ metricas_post, ...p }) => {
        const ultima = [...((metricas_post as Metrica[]) ?? [])].sort((a, b) => b.data.localeCompare(a.data))[0];
        return {
          ...(p as Omit<Post, "alcance" | "views" | "salvamentos" | "compartilhamentos">),
          alcance: ultima?.alcance ?? null,
          views: ultima?.views ?? null,
          salvamentos: ultima?.salvamentos ?? null,
          compartilhamentos: ultima?.compartilhamentos ?? null,
        };
      });
    },
  });
}

export function useMetricasConta() {
  const { demo, conta } = useAcesso();
  return useQuery({
    queryKey: ["metricas_conta", conta?.conta_id],
    enabled: !demo && !!conta,
    queryFn: async (): Promise<MetricaConta[]> => {
      const { data, error } = await supabase
        .from("metricas_conta")
        .select("data, seguidores, seguindo, total_posts, alcance")
        .eq("conta_id", conta!.conta_id)
        .order("data", { ascending: true })
        .limit(180);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export const numero = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));

/** Datas puras (AAAA-MM-DD) não passam por Date: seriam lidas como meia-noite UTC e voltariam um dia no Brasil. */
export function dataCurta(iso: string | null) {
  if (!iso) return "—";
  const soData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (soData) return `${soData[3]}/${soData[2]}/${soData[1].slice(2)}`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
