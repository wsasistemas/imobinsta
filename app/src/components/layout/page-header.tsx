import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Tile, type CorTile } from "@/components/ui/tile";

export function PageHeader({
  titulo,
  subtitulo,
  icone,
  cor,
  acoes,
}: {
  titulo: string;
  subtitulo?: string;
  icone?: LucideIcon;
  cor?: CorTile;
  acoes?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-center gap-4">
      {icone && cor && <Tile icone={icone} cor={cor} tamanho="lg" />}
      <div className="min-w-0">
        <h1>{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sub text-label2">{subtitulo}</p>}
      </div>
      {acoes && <div className="ml-auto flex gap-3">{acoes}</div>}
    </div>
  );
}
