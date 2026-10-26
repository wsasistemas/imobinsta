import { useEffect, useState } from "react";

export type Tema = "dark" | "light";
const CHAVE = "imobinsta-tema";

function lerTema(): Tema {
  try {
    return localStorage.getItem(CHAVE) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/** Tema escuro (padrão) ou claro, lembrado por navegador. */
export function useTema() {
  const [tema, setTema] = useState<Tema>(lerTema);

  useEffect(() => {
    document.documentElement.dataset.theme = tema;
    try {
      localStorage.setItem(CHAVE, tema);
    } catch {
      /* navegador sem storage: o tema só não fica lembrado */
    }
  }, [tema]);

  return [tema, setTema] as const;
}
