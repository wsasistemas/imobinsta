import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { Menu, X } from "lucide-react";
import { Segmentado } from "@/components/ui/hig";
import { useTema, type Tema } from "@/lib/tema";
import { Sidebar } from "./sidebar";

export function AppShell() {
  const [tema, setTema] = useTema();
  const [gaveta, setGaveta] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setGaveta(false), [pathname]);

  return (
    <div className="flex min-h-screen">
      {/* Desktop: sidebar fixa */}
      <aside className="sticky top-0 hidden h-screen w-[280px] flex-none border-r-[0.5px] lg:block">
        <Sidebar />
      </aside>

      {/* Celular: gaveta */}
      {gaveta && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/40" onClick={() => setGaveta(false)} />
          <aside className="pagina-entra absolute inset-y-0 left-0 w-[300px] max-w-[85vw] shadow-hig">
            <Sidebar aoNavegar={() => setGaveta(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-[52px] items-center gap-3 border-b-[0.5px] bg-bg2 px-4 text-foot text-label2 lg:px-8">
          <button
            type="button"
            className="-ml-2 grid size-11 place-items-center rounded-full text-label hover:bg-fill3 lg:hidden"
            aria-label={gaveta ? "Fechar menu" : "Abrir menu"}
            onClick={() => setGaveta((v) => !v)}
          >
            {gaveta ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <span className="hidden rounded-full bg-green/20 px-2.5 py-0.5 text-cap2 font-semibold whitespace-nowrap text-green sm:inline">
            100% PRÓPRIO
          </span>
          <span className="min-w-0 truncate">
            <b className="font-semibold text-label">Estúdio imobinsta</b>
            <span className="hidden md:inline"> — criar, publicar e vender no Instagram</span>
          </span>
          <Segmentado<Tema>
            className="ml-auto"
            rotulo="Tema"
            valor={tema}
            onChange={setTema}
            opcoes={[
              { valor: "dark", rotulo: "Escuro" },
              { valor: "light", rotulo: "Claro" },
            ]}
          />
        </header>

        <main className="w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
