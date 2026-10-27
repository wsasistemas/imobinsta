import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Check, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export const ETAPAS = ["Formato", "Conteúdo", "Prompt", "Editor", "Publicar"] as const;

/** Trilha de etapas do fluxo Criar (igual ao mockup). */
export function Etapas({ atual }: { atual: number }) {
  return (
    <ol aria-label="Etapas" className="mb-8 flex flex-wrap justify-center gap-2">
      {ETAPAS.map((e, i) => (
        <li
          key={e}
          aria-current={i === atual ? "step" : undefined}
          className={cn(
            "flex items-center gap-2 rounded-full bg-fill3 px-3.5 py-1.5 text-foot font-medium text-label2",
            i === atual && "bg-blue text-white",
            i < atual && "text-green",
          )}
        >
          {i < atual ? <Check className="size-3.5" aria-hidden /> : <span aria-hidden className={cn("size-[7px] rounded-full bg-label3", i === atual && "bg-white")} />}
          {e}
        </li>
      ))}
    </ol>
  );
}

/** Cartão de opção selecionável (objetivo, origem, abordagem). */
export function Opcao({
  ativo, onClick, children, className, desativado,
}: { ativo: boolean; onClick: () => void; children: ReactNode; className?: string; desativado?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativo}
      disabled={desativado}
      onClick={onClick}
      className={cn(
        "rounded-hig-xl bg-bg2 p-6 text-left shadow-hig transition-[box-shadow,transform] duration-200 ease-apple active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
        ativo && "ring-2 ring-blue",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Chip({ ativo, onClick, children, desativado }: { ativo: boolean; onClick?: () => void; children: ReactNode; desativado?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      disabled={desativado}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-full bg-fill3 px-4 text-foot font-medium transition-colors hover:bg-fill2 disabled:opacity-40 [&_svg]:size-4",
        ativo && "bg-label text-bg hover:bg-label",
      )}
    >
      {children}
    </button>
  );
}

export function Rotulo({ children }: { children: ReactNode }) {
  return <div className="mt-8 mb-3 text-foot tracking-[0.02em] text-label2 uppercase [&_small]:normal-case">{children}</div>;
}

export function Nota({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-hig-lg bg-fill3 px-4 py-3 text-foot leading-normal text-label2 [&_b]:text-label", className)}>
      <Info className="mt-px size-[18px] flex-none text-orange" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

/** Largura disponível de um elemento (o canvas encolhe no celular). */
export function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([e]) => setLargura(e.contentRect.width));
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, largura] as const;
}

