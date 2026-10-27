import {
  CalendarDays, ChartColumn, Clapperboard, Compass, Images, Instagram, LibraryBig, Plus, PlugZap, Radar, Send,
  Sparkles, UserRound, Zap, type LucideIcon,
} from "lucide-react";
import type { CorTile } from "@/components/ui/tile";

export type ItemMenu = {
  id: string;
  rotulo: string;
  caminho: string;
  icone: LucideIcon;
  cor: CorTile;
  /** Fase do plano em que a tela ganha conteúdo (aparece no "em construção"). */
  fase: number;
  grupo?: "VENDAS" | "RESULTADOS" | "CONTA";
  etiqueta?: { texto: string; gratis?: boolean };
  /** Tela fora do menu lateral (etapas do fluxo Criar). */
  oculto?: boolean;
};

/** Fonte única das telas do estúdio: menu lateral, rotas e títulos saem daqui. */
export const MENU: ItemMenu[] = [
  { id: "explorar", rotulo: "Explorar", caminho: "/", icone: Compass, cor: "blue", fase: 1 },
  { id: "biblioteca", rotulo: "Biblioteca", caminho: "/biblioteca", icone: LibraryBig, cor: "orange", fase: 3 },
  { id: "midias", rotulo: "Banco de mídias", caminho: "/midias", icone: Images, cor: "teal", fase: 3 },
  { id: "calendario", rotulo: "Calendário", caminho: "/calendario", icone: CalendarDays, cor: "red", fase: 6 },
  { id: "avatares", rotulo: "Meus avatares", caminho: "/avatares", icone: UserRound, cor: "purple", fase: 7, etiqueta: { texto: "IA" } },
  { id: "automacoes", rotulo: "Automações", caminho: "/automacoes", icone: Zap, cor: "yellow", fase: 5, grupo: "VENDAS", etiqueta: { texto: "Chatfyre" } },
  { id: "radar", rotulo: "Radar de prospecção", caminho: "/radar", icone: Radar, cor: "green", fase: 9, grupo: "VENDAS" },
  { id: "analytics", rotulo: "Analytics", caminho: "/analytics", icone: ChartColumn, cor: "indigo", fase: 2, grupo: "RESULTADOS" },
  { id: "conexoes", rotulo: "Conexões e custos", caminho: "/conexoes", icone: PlugZap, cor: "gray", fase: 1, grupo: "CONTA", etiqueta: { texto: "R$ 0", gratis: true } },

  { id: "criar", rotulo: "Criar", caminho: "/criar", icone: Plus, cor: "blue", fase: 4, oculto: true },
  { id: "criar-imagem", rotulo: "Post de imagem e carrossel", caminho: "/criar/imagem", icone: Sparkles, cor: "pink", fase: 4, oculto: true },
  { id: "criar-avatar", rotulo: "Vídeo narrado com avatar", caminho: "/criar/avatar", icone: Clapperboard, cor: "purple", fase: 7, oculto: true },
  { id: "publicar", rotulo: "Publicar", caminho: "/publicar", icone: Send, cor: "blue", fase: 5, oculto: true },
  { id: "conectar-instagram", rotulo: "Conectar o Instagram", caminho: "/conexoes/instagram", icone: Instagram, cor: "instagram", fase: 2, oculto: true },
];
