import { useLocation } from "react-router";
import { Hammer } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MENU } from "@/components/layout/menu";
import { Card } from "@/components/ui/hig";

/** Tela reservada: a rota existe desde a Fase 1 e ganha conteúdo na fase indicada no plano. */
export function EmConstrucao() {
  const { pathname } = useLocation();
  const item = MENU.find((i) => i.caminho === pathname);

  return (
    <section className="pagina-entra">
      <PageHeader titulo={item?.rotulo ?? "Em construção"} icone={item?.icone ?? Hammer} cor={item?.cor ?? "gray"} />
      <Card className="max-w-xl">
        <p className="text-body font-semibold">Esta tela chega na Fase {item?.fase ?? "—"}.</p>
        <p className="mt-2 text-sub text-label2">
          O layout já está no mockup aprovado. O que cada fase entrega está em <code>docs/PLANO-fases.md</code>.
        </p>
      </Card>
    </section>
  );
}
