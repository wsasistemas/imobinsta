import { NavLink } from "react-router";
import { LogOut, Plus } from "lucide-react";
import { Tile } from "@/components/ui/tile";
import { cn } from "@/lib/utils";
import { useAcesso } from "@/features/auth/acesso";
import { MENU } from "./menu";

export function Sidebar({ aoNavegar }: { aoNavegar?: () => void }) {
  const { conta, usuario, sair } = useAcesso();
  const itens = MENU.filter((i) => !i.oculto);
  let grupoAtual: string | undefined;

  return (
    <nav aria-label="Menu principal" className="flex h-full flex-col gap-0.5 overflow-y-auto bg-bg2 px-3 py-4">
      <div className="flex items-center gap-3 px-2 pt-1 pb-4">
        <span className="grid size-10 place-items-center rounded-full bg-white text-cap1 font-extrabold text-[#0A4FD6] shadow-[0_0_0_0.5px_var(--sep)]">
          WSA
        </span>
        <div className="min-w-0">
          <b className="block truncate text-sub font-semibold">{conta?.nome ?? "WSA Sistemas de IA"}</b>
          <small className="text-foot text-label2">@{conta?.ig_username ?? "wsasistemas.ia"}</small>
        </div>
      </div>

      <NavLink
        to="/criar"
        onClick={aoNavegar}
        className="mb-3 flex min-h-11 items-center justify-center gap-2 rounded-full bg-blue font-semibold text-white transition-[transform,filter] duration-100 hover:brightness-110 active:scale-[0.97]"
      >
        <Plus className="size-[18px]" /> Criar
      </NavLink>

      {itens.map((item) => {
        const titulo = item.grupo && item.grupo !== grupoAtual ? item.grupo : null;
        grupoAtual = item.grupo ?? grupoAtual;
        return (
          <div key={item.id}>
            {titulo && <div className="px-2 pt-4 pb-1 text-foot text-label2">{titulo}</div>}
            <NavLink
              to={item.caminho}
              end={item.caminho === "/"}
              onClick={aoNavegar}
              className={({ isActive }) =>
                cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-[10px] px-2 text-sub font-medium transition-colors duration-200 hover:bg-fill3",
                  isActive && "bg-tint [&_.rotulo]:font-semibold [&_.rotulo]:text-blue",
                )
              }
            >
              <Tile icone={item.icone} cor={item.cor} />
              <span className="rotulo">{item.rotulo}</span>
              {item.etiqueta && (
                <span
                  className={cn(
                    "ml-auto rounded-full px-2 py-0.5 text-cap2 font-semibold",
                    item.etiqueta.gratis ? "bg-green/20 text-green" : "bg-fill2 text-label2",
                  )}
                >
                  {item.etiqueta.texto}
                </span>
              )}
            </NavLink>
          </div>
        );
      })}

      <div className="mt-auto flex items-center gap-3 border-t-[0.5px] px-2 pt-4">
        <span className="size-9 flex-none rounded-full bg-[linear-gradient(135deg,#FF9F0A,#FF375F)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <b className="block truncate text-sub font-semibold">{usuario?.email ?? "—"}</b>
          <small className="block text-foot text-label2">{conta?.papel === "dono" ? "Dono da conta" : "Editor"}</small>
        </div>
        <button
          type="button"
          onClick={sair}
          aria-label="Sair"
          title="Sair"
          className="grid size-11 place-items-center rounded-full text-label2 transition-colors hover:bg-fill3 hover:text-label"
        >
          <LogOut className="size-[18px]" />
        </button>
      </div>
    </nav>
  );
}
