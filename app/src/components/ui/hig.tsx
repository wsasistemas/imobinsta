import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Cartão HIG: fundo secundário, raio 20, sombra suave. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-hig-xl bg-bg2 p-6 shadow-hig", className)} {...props} />;
}

const tons = {
  ok: "bg-green/15 text-green",
  aviso: "bg-orange/15 text-orange",
  info: "bg-tint text-blue",
  neutro: "bg-fill2 text-label2",
  instagram: "bg-pink/15 text-pink",
};

export function Badge({ tom = "neutro", className, children }: { tom?: keyof typeof tons; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-cap1 font-semibold [&_svg]:size-[13px]", tons[tom], className)}>
      {children}
    </span>
  );
}

/** Controle segmentado do iOS (abas). */
export function Segmentado<T extends string>({
  opcoes,
  valor,
  onChange,
  rotulo,
  className,
}: {
  opcoes: { valor: T; rotulo: ReactNode }[];
  valor: T;
  onChange: (v: T) => void;
  rotulo: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className={cn("inline-flex rounded-[9px] bg-fill3 p-0.5", className)}>
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={o.valor === valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            "min-h-7 rounded-[7px] px-3 text-foot font-medium transition-[background-color] duration-200",
            o.valor === valor && "bg-seg-on font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.25)]",
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

/** Interruptor do iOS (51×31). */
export function Toggle({ ligado, onChange, rotulo }: { ligado: boolean; onChange?: (v: boolean) => void; rotulo: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={() => onChange?.(!ligado)}
      className={cn(
        "relative h-[31px] w-[51px] flex-none rounded-full transition-colors duration-200",
        ligado ? "bg-green" : "bg-fill",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_3px_1px_rgba(0,0,0,0.06)] transition-[left] duration-200 ease-apple",
          ligado ? "left-[22px]" : "left-0.5",
        )}
      />
    </button>
  );
}
