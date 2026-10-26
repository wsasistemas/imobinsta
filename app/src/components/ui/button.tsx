import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Botão HIG: cápsula, mínimo de 44 pt, encolhe levemente ao tocar. */
export const botao = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold text-sub whitespace-nowrap transition-[transform,filter,background-color] duration-200 ease-apple active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[18px]",
  {
    variants: {
      variante: {
        primario: "bg-blue text-white hover:brightness-110",
        secundario: "bg-fill2 text-blue hover:bg-fill",
        sucesso: "bg-green text-white hover:brightness-110",
        destaque: "bg-indigo text-white hover:brightness-110",
        simples: "text-blue hover:bg-fill3",
      },
      tamanho: {
        md: "min-h-11 px-5",
        sm: "min-h-8 px-3 text-foot",
        icone: "size-11",
      },
    },
    defaultVariants: { variante: "primario", tamanho: "md" },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof botao>;

export function Button({ className, variante, tamanho, type = "button", ...props }: Props) {
  return <button type={type} className={cn(botao({ variante, tamanho }), className)} {...props} />;
}
