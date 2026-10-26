import { Link } from "react-router";
import { CalendarPlus, Clapperboard, Layers, MessageCircleHeart, Plus, Sparkles } from "lucide-react";
import { botao } from "@/components/ui/button";
import { Tile, type CorTile } from "@/components/ui/tile";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const ATALHOS: { titulo: string; texto: string; icone: LucideIcon; cor: CorTile; para: string }[] = [
  { titulo: "Carrossel", texto: "1080×1350, até 10 slides", icone: Layers, cor: "purple", para: "/criar/imagem" },
  { titulo: "Reels", texto: "1080×1920, 15 a 60 s", icone: Clapperboard, cor: "blue", para: "/criar/avatar" },
  { titulo: "Pauta da semana", texto: "IA sugere 2 posts por semana", icone: CalendarPlus, cor: "red", para: "/calendario" },
  { titulo: "Comentou → DM", texto: "Vende enquanto você dorme", icone: MessageCircleHeart, cor: "orange", para: "/automacoes" },
];

export function Explorar() {
  return (
    <section className="pagina-entra">
      <div className="grid min-h-[440px] items-center gap-8 overflow-hidden rounded-[28px] bg-[radial-gradient(110%_130%_at_88%_25%,#2E5BFF_0%,#1A1F5C_42%,#0B0B14_78%)] p-8 text-white shadow-hig md:grid-cols-[1.1fr_1fr] md:p-12">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-cap1 font-semibold">
            <Sparkles className="size-[13px]" /> Novo
          </span>
          <h1 className="mt-5 text-[40px] leading-[1.05] tracking-[-0.03em] md:text-disp">
            Reels a partir
            <br />
            das suas fotos
          </h1>
          <p className="mt-4 max-w-[460px] text-body leading-normal text-white/70">
            Escolha imagens do banco de mídias, escreva o roteiro e o vídeo sai montado com legenda, trilha livre e a cara da WSA.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/criar" className={botao()}>
              <Plus /> Criar agora
            </Link>
            <Link to="/biblioteca" className={cn(botao({ variante: "secundario" }), "bg-white/15 text-white hover:bg-white/25")}>
              Ver biblioteca
            </Link>
          </div>
        </div>

        <div className="relative hidden h-[380px] md:block" aria-hidden>
          <div className="absolute top-7 left-[8%] h-[380px] w-[214px] -rotate-6 overflow-hidden rounded-[34px] border-[6px] border-[#111] bg-[linear-gradient(160deg,#2A1308,#5B2A12_55%,#D97706)] p-5 text-xl leading-tight font-black opacity-80 shadow-2xl">
            VOCÊ FAZ O MELHOR DOCE DA CIDADE.
          </div>
          <div className="absolute top-0 left-[38%] h-[380px] w-[214px] overflow-hidden rounded-[34px] border-[6px] border-[#111] bg-[linear-gradient(160deg,#0B2A6B,#0A58D6_60%,#05B4FF)] p-5 text-[22px] leading-[1.05] font-black shadow-2xl">
            O TOTVS RM NÃO FOI FEITO PARA SER LENTO
            <div className="absolute inset-x-3.5 bottom-5 rounded-hig-md bg-black/55 p-2.5 text-center text-foot font-bold">
              Comente QUERO e receba o ecossistema
            </div>
          </div>
        </div>
      </div>

      <h2 className="mt-10 mb-4">Atalhos</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ATALHOS.map((a) => (
          <Link
            key={a.titulo}
            to={a.para}
            className="flex flex-col gap-3 rounded-hig-xl bg-bg2 p-6 shadow-hig transition-transform duration-200 ease-apple hover:-translate-y-0.5 active:scale-[0.98]"
          >
            <Tile icone={a.icone} cor={a.cor} tamanho="lg" />
            <h3>{a.titulo}</h3>
            <p className="text-foot text-label2">{a.texto}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
