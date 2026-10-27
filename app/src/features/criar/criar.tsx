import { Link } from "react-router";
import { Clapperboard, Facebook, Images, Instagram, Linkedin, type LucideIcon, Sparkles, UserRoundCheck, WandSparkles, Youtube } from "lucide-react";
import { Badge } from "@/components/ui/hig";
import { Tile, type CorTile } from "@/components/ui/tile";
import { cn } from "@/lib/utils";

type Tipo = {
  titulo: string; texto: string; icone: LucideIcon; cor: CorTile; redes: LucideIcon[];
  custo: string; gratis: boolean; para?: string; fase?: number;
};

const TIPOS: Tipo[] = [
  { titulo: "Vídeo narrado com avatar", texto: "Seu avatar fala o roteiro com a sua voz, com legenda, cenas e CTA. Ideal para Reels de venda.", icone: UserRoundCheck, cor: "purple", redes: [Instagram, Youtube, Linkedin], custo: "Pago por uso · provedor de IA", gratis: false, fase: 7 },
  { titulo: "Posts de imagem", texto: "Post único, carrossel e stories a partir de templates da WSA. Texto e fundo editáveis.", icone: Images, cor: "pink", redes: [Instagram, Facebook, Linkedin], custo: "Grátis · template + IA de texto", gratis: true, para: "/criar/imagem" },
  { titulo: "Reels / vídeo", texto: "Monte Reels com suas fotos e vídeos: cortes, legenda automática, trilha livre e logo.", icone: Clapperboard, cor: "blue", redes: [Instagram, Youtube], custo: "Grátis · render no seu PC", gratis: true, fase: 8 },
  { titulo: "Imagem gerada por IA", texto: "A IA (OpenAI GPT Image ou outro modelo) cria a arte inteira do zero, com fotos realistas e a sua marca.", icone: Sparkles, cor: "indigo", redes: [Instagram], custo: "Pago por uso · provedor de IA", gratis: false, fase: 7 },
];

function Conteudo({ t }: { t: Tipo }) {
  return (
    <>
      <div className="grid h-[170px] place-items-center bg-fill3">
        <Tile icone={t.icone} cor={t.cor} tamanho="xl" />
      </div>
      <div className="px-6 pt-5 pb-6">
        <h3 className="mb-2">{t.titulo}</h3>
        <p className="text-foot leading-normal text-label2">{t.texto}</p>
        <div className="mt-4 flex gap-3 text-label2">{t.redes.map((R, i) => <R key={i} className="size-[18px]" aria-hidden />)}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tom={t.gratis ? "ok" : "aviso"}>{t.custo}</Badge>
          {t.fase && <Badge>chega na Fase {t.fase}</Badge>}
        </div>
      </div>
    </>
  );
}

/** "O que você quer criar?" — porta de entrada do fluxo Criar. */
export function Criar() {
  const base = "block overflow-hidden rounded-hig-2xl bg-bg2 text-left shadow-hig transition-[transform,box-shadow] duration-200 ease-apple";
  return (
    <section className="pagina-entra">
      <div className="mx-auto mb-8 max-w-[820px] text-center">
        <h1 className="text-[40px]">O que você quer criar?</h1>
        <p className="mt-2 text-body leading-normal text-label2">Escolha o tipo de conteúdo. Tudo sai pronto para publicar no Instagram.</p>
      </div>
      <div className="mx-auto grid max-w-[1400px] gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {TIPOS.map((t) =>
          t.para ? (
            <Link key={t.titulo} to={t.para} className={cn(base, "hover:-translate-y-[3px] hover:ring-2 ring-blue active:scale-[0.98]")}>
              <Conteudo t={t} />
            </Link>
          ) : (
            <div key={t.titulo} aria-disabled className={cn(base, "opacity-60")}>
              <Conteudo t={t} />
            </div>
          ),
        )}
      </div>
      <p className="mt-6 text-center text-label2">
        <Link to="/criar/imagem" className="inline-flex items-center gap-1.5 hover:text-blue">
          <WandSparkles className="size-4" aria-hidden /> ou comece do zero no editor
        </Link>
      </p>
    </section>
  );
}
