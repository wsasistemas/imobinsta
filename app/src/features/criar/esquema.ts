// Formato do JSON dos slides. Espelho de supabase/functions/_shared/slides.ts:
// mudou aqui, muda lá. A resposta da IA é validada de novo antes de entrar no editor.
import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const DadosSlide = z.object({
  layout: z.enum(["capa", "lista", "grade", "cta"]),
  titulo: z.string().min(1).max(160),
  texto: z.string().max(300).optional(),
  itens: z.array(z.string().min(1).max(60)).max(8).optional(),
  cta: z.string().max(100).optional(),
  cor_destaque: hex.optional(),
  cor_fundo: hex.optional(),
  posicao: z.enum(["topo", "centro", "base"]).optional(),
  fundo_midia: z.string().max(300).optional(), // caminho no bucket da imagem de fundo (Fase 7)
});
export type DadosSlide = z.infer<typeof DadosSlide>;

export const Geracao = z.object({
  slides: z.array(DadosSlide).min(1).max(10),
  legenda: z.string().min(1).max(2200),
  hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]+$/u)).max(5),
});
export type Geracao = z.infer<typeof Geracao>;

export const Edicao = z.object({
  alteracoes: DadosSlide.partial(),
  resposta: z.string().min(1).max(400),
});

export const Link = z.object({ url: z.string(), titulo: z.string(), descricao: z.string(), corpo: z.string() });
export type Link = z.infer<typeof Link>;

export const PromptAdaptado = z.object({ prompt: z.string().min(1) });

export type TemplateId = "wsa-neon" | "wsa-escuro" | "wsa-docerias";
export type Objetivo = "engajar" | "seguidores" | "vender";
export type Origem = "zero" | "link" | "pauta";

/** Tamanho real do PNG (padrão retrato do Instagram). */
export const LARGURA = 1080;
export const ALTURA = 1350;
export const MAX_SLIDES = 10;
export const MAX_LEGENDA = 2200;
export const MAX_HASHTAGS = 5;

export const PRODUTOS = [
  "Ecossistema completo", "ERP + TOTVS RM", "Imobiliárias", "Portal de compras", "Helpdesk",
  "Cobrança + assinatura", "Aprovações / RH", "Confeitarias",
] as const;

export const ABORDAGENS = [
  { valor: "Viral", emoji: "🔥" },
  { valor: "Dor + solução", emoji: "🎯" },
  { valor: "Educativo", emoji: "📚" },
  { valor: "Comunidade", emoji: "💬" },
] as const;

/** Slide novo, em branco, para o botão "+" do editor. */
export function slideVazio(layout: DadosSlide["layout"] = "lista"): DadosSlide {
  return { layout, titulo: "Novo slide", texto: "Clique no texto para editar." };
}

/** Hashtags da legenda (para o limite de 5). */
export function hashtagsDa(legenda: string) {
  return legenda.match(/#[\p{L}\p{N}_]+/gu) ?? [];
}
