import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAcesso } from "@/features/auth/acesso";
import { DadosSlide, type Objetivo, type Origem, type TemplateId } from "./esquema";

export type Rascunho = {
  id: string;
  formato: "post" | "carrossel";
  objetivo: Objetivo | null;
  produto: string | null;
  abordagem: string | null;
  origem: Origem | null;
  link_url: string | null;
  prompt: string | null;
  legenda: string | null;
  status: string;
  template_id: TemplateId | null;
  mostrar_logo: boolean;
  criar_automacao: boolean;
  automacao_json: AutomacaoConfig | null;
  agendado_para: string | null;
  permalink: string | null;
  erro: string | null;
};

/**
 * Configuração da automação "comente a palavra → DM" escolhida na tela Publicar. Depois de publicar, o
 * ig-publicar cria no Chatfyre (pausada, com o media_id). Espelho do zod em supabase/functions/_shared/automacao.ts.
 */
export type AutomacaoConfig = {
  palavra: string; resposta_publica: string; dm: string; botao: string; so_seguidores: boolean; link: string;
  texto_link: string; botao_link: string; lembrete_min: number; texto_lembrete: string;
};

export const AUTOMACAO_PADRAO: AutomacaoConfig = {
  palavra: "QUERO",
  resposta_publica: "Te mandei no direct! 📩",
  dm: "Oi! Aqui é a WSA Sistemas de IA 👋 Toca no botão abaixo que eu te mostro tudo 👇",
  botao: "Quero conhecer",
  so_seguidores: true,
  link: "",
  texto_link: "Aqui está o link que te prometi 👇",
  botao_link: "Abrir",
  lembrete_min: 60,
  texto_lembrete: "Passando para lembrar: o link continua aqui em cima 😉",
};

export type SlideSalvo = { id: string; ordem: number; template_id: TemplateId; dados: DadosSlide; midia_id: string | null };

/** Post de exemplo do modo demonstração (só `npm run dev` com ?demo=1). Não é dado real. */
export const ID_DEMO = "demo";
const DEMO: { post: Rascunho; slides: SlideSalvo[] } = {
  post: {
    id: ID_DEMO, formato: "carrossel", objetivo: "vender", produto: "Ecossistema completo", abordagem: "Dor + solução",
    origem: "zero", link_url: null, prompt: null, status: "rascunho", template_id: "wsa-neon", mostrar_logo: true, criar_automacao: true,
    automacao_json: null, agendado_para: null, permalink: null, erro: null,
    legenda: "Exemplo de legenda do modo demonstração.\n\nComente QUERO para receber o material no direct.\n\n#erp #totvs #gestao",
  },
  slides: [
    { id: "d1", ordem: 1, template_id: "wsa-neon", midia_id: null, dados: { layout: "capa", titulo: "Parar de remendar o seu ERP é o primeiro passo para o *lucro real.*", texto: "O caos de sistemas isolados termina aqui." } },
    { id: "d2", ordem: 2, template_id: "wsa-neon", midia_id: null, dados: { layout: "grade", titulo: "Um ecossistema, *um só login*", itens: ["Imobiliárias", "Compras", "Helpdesk", "Cobrança", "Aprovações", "RH", "TOTVS RM", "Docerias"] } },
    { id: "d3", ordem: 3, template_id: "wsa-neon", midia_id: null, dados: { layout: "lista", titulo: "O que muda na *sua rotina*", itens: ["IA que une pessoas, processos e resultados.", "Integração nativa com TOTVS RM.", "Aprovações no celular, sem planilha."] } },
    { id: "d4", ordem: 4, template_id: "wsa-neon", midia_id: null, dados: { layout: "cta", titulo: "Quer ver funcionando?", cta: "Comente QUERO e receba o ecossistema no direct" } },
  ],
};

export function useRascunho(id: string | undefined) {
  const { demo } = useAcesso();
  return useQuery({
    queryKey: ["rascunho", id],
    enabled: !!id && (!demo || id === ID_DEMO),
    queryFn: async () => {
      if (id === ID_DEMO) return structuredClone(DEMO);
      const { data: post, error } = await supabase
        .from("posts")
        .select("id, formato, objetivo, produto, abordagem, origem, link_url, prompt, legenda, status, template_id, mostrar_logo, criar_automacao, automacao_json, agendado_para, permalink, erro")
        .eq("id", id!)
        .single();
      if (error) throw error;
      const { data: linhas, error: eSl } = await supabase
        .from("post_slides")
        .select("id, ordem, template_id, dados_json, midia_id")
        .eq("post_id", id!)
        .order("ordem");
      if (eSl) throw eSl;
      const slides: SlideSalvo[] = (linhas ?? []).map((l) => {
        const v = DadosSlide.safeParse(l.dados_json);
        return {
          id: l.id, ordem: l.ordem, template_id: l.template_id, midia_id: l.midia_id,
          dados: v.success ? v.data : { layout: "lista", titulo: "Slide com dados inválidos: edite o texto" },
        };
      });
      return { post: post as Rascunho, slides };
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** Cria o rascunho com os slides gerados. Se os slides falharem, apaga o post (não deixa órfão). */
export async function criarRascunho(
  contaId: string,
  post: Omit<Rascunho, "id" | "status" | "automacao_json" | "agendado_para" | "permalink" | "erro">,
  slides: DadosSlide[],
): Promise<string> {
  const { data, error } = await supabase
    .from("posts")
    .insert({ ...post, conta_id: contaId, status: "rascunho", pasta: post.produto })
    .select("id")
    .single();
  if (error) throw error;
  const { error: eSl } = await supabase.from("post_slides").insert(
    slides.map((dados, i) => ({ post_id: data.id, ordem: i + 1, template_id: post.template_id ?? "wsa-neon", dados_json: dados })),
  );
  if (eSl) {
    await supabase.from("posts").delete().eq("id", data.id);
    throw eSl;
  }
  return data.id as string;
}

/** Chama uma Edge Function do estúdio e devolve o JSON. Em erro, usa a mensagem que a função mandou. */
export async function chamarFuncao<T>(nome: string, corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(nome, { body: corpo });
  if (error) {
    const resp = "context" in error ? (error.context as Response) : null;
    const json = resp ? await resp.json().catch(() => null) : null;
    throw new Error(json?.erro ?? `Falha ao chamar ${nome}.`);
  }
  return data as T;
}
