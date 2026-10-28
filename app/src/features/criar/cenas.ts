// Cenas do vídeo explicativo com avatar (Fase 13): espelho de imobinsta.roteiro_cenas.

export type Layout = "apresentador" | "canto" | "bolha" | "dividida";
export type Cena = {
  id: string; ordem: number; fala: string; layout: Layout; fundo_midia_id: string | null; look_id: string | null;
  montagem: { x?: number; y?: number; tamanho?: number; forma?: "recorte" | "bolha" | "cartao" };
  status: "rascunho" | "gerando" | "pronto" | "erro"; avatar_midia_id: string | null; fala_gerada: string | null; erro: string | null;
};
export const LAYOUTS: { valor: Layout; rotulo: string; texto: string }[] = [
  { valor: "apresentador", rotulo: "Apresentador", texto: "avatar em tela cheia" },
  { valor: "canto", rotulo: "Avatar no canto", texto: "sistema ao fundo" },
  { valor: "bolha", rotulo: "Bolha", texto: "avatar em círculo" },
  { valor: "dividida", rotulo: "Tela dividida", texto: "sistema em cima" },
];
const PALAVRAS_POR_SEGUNDO = 150 / 60;
export const segundosDa = (fala: string) => Math.max(1, Math.round(fala.trim().split(/\s+/).filter(Boolean).length / PALAVRAS_POR_SEGUNDO));
