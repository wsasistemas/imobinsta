// Formato do JSON que a IA devolve. Espelho de app/src/features/criar/esquema.ts:
// mudou lá, muda aqui (o app valida de novo antes de aplicar).
import { z } from "npm:zod@3.25.76";

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
  fundo_midia: z.string().max(300).optional(), // caminho no bucket da imagem de fundo (Fase 7); a IA de texto não mexe
});
export type DadosSlide = z.infer<typeof DadosSlide>;

export const Geracao = z.object({
  slides: z.array(DadosSlide).min(1).max(10),
  legenda: z.string().min(1).max(2200),
  hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]+$/u)).max(5),
});

export const Edicao = z.object({
  alteracoes: DadosSlide.partial(),
  resposta: z.string().min(1).max(400),
});

export const PromptAdaptado = z.object({ prompt: z.string().min(20).max(4000) });

/** Descrição do formato para o prompt do Gemini (texto, porque o JSON Schema do Gemini é limitado). */
export const FORMATO_SLIDE = `{
  "layout": "capa" | "lista" | "grade" | "cta",
  "titulo": string (até 160 caracteres; marque 1 a 3 palavras de destaque com *asteriscos*),
  "texto": string opcional (até 300),
  "itens": string[] opcional (até 8, cada um com até 60; usado em "lista" e "grade"),
  "cta": string opcional (até 100; obrigatório no layout "cta"),
  "cor_destaque": "#RRGGBB" opcional,
  "cor_fundo": "#RRGGBB" opcional,
  "posicao": "topo" | "centro" | "base" opcional
}`;
