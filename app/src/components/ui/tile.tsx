import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Cores dos blocos de ícone (estilo Ajustes do iOS). Uma cor fixa por área do estúdio. */
export const coresTile = {
  blue: "bg-[linear-gradient(180deg,#3B9BFF,var(--blue))]",
  orange: "bg-[linear-gradient(180deg,#FFB340,var(--orange))]",
  teal: "bg-[linear-gradient(180deg,#7ADBFF,#32ADE6)]",
  red: "bg-[linear-gradient(180deg,#FF6961,var(--red))]",
  purple: "bg-[linear-gradient(180deg,#D17BF6,var(--purple))]",
  indigo: "bg-[linear-gradient(180deg,#7D7AFF,var(--indigo))]",
  green: "bg-[linear-gradient(180deg,#5BE07D,#28B44A)]",
  pink: "bg-[linear-gradient(180deg,#FF6482,var(--pink))]",
  gray: "bg-[linear-gradient(180deg,#A1A1A6,#7C7C80)]",
  yellow: "bg-[linear-gradient(180deg,#FFE066,#F5B800)] text-[#3a2a00]",
  instagram: "bg-[radial-gradient(circle_at_30%_107%,#fdf497_0%,#fd5949_45%,#d6249f_60%,#285AEB_90%)]",
} as const;

export type CorTile = keyof typeof coresTile;

const tamanhos = {
  sm: "size-[30px] rounded-[7px] [&_svg]:size-[18px]",
  lg: "size-[52px] rounded-[12px] [&_svg]:size-7",
  xl: "size-[72px] rounded-[16px] [&_svg]:size-[38px]",
};

type Props = {
  icone: LucideIcon;
  cor: CorTile;
  tamanho?: keyof typeof tamanhos;
  className?: string;
};

export function Tile({ icone: Icone, cor, tamanho = "sm", className }: Props) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid flex-none place-items-center text-white shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.12)]",
        tamanhos[tamanho],
        coresTile[cor],
        className,
      )}
    >
      <Icone strokeWidth={2} />
    </span>
  );
}
