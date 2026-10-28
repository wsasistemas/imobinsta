import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/hig";
import { useAcesso } from "@/features/auth/acesso";
import { Nota } from "./comum";
import { criarRascunho } from "./dados";
import { MAX_SLIDES, PRODUTOS, slideDeMidia } from "./esquema";
import { type MidiaEscolhida, SeletorMidia } from "./seletor-midia";

/**
 * Post ou carrossel a partir das fotos e vídeos do Banco de mídias (Fase 12.1). Sem IA: cria o rascunho com um
 * slide por mídia, na ordem escolhida, e abre o editor (texto opcional, enquadramento, slides de template).
 */
export function PostComFotos() {
  const { conta, demo } = useAcesso();
  const navegar = useNavigate();
  const [produto, setProduto] = useState<string>(PRODUTOS[0]);
  const [aberto, setAberto] = useState(false);

  const criar = useMutation({
    mutationFn: async (midias: MidiaEscolhida[]) => {
      const slides = midias.slice(0, MAX_SLIDES).map(slideDeMidia);
      if (slides.length === 1 && slides[0].layout === "video") {
        throw new Error("Um vídeo sozinho é Reels, não post. Escolha mais itens para um carrossel, ou use o Reels.");
      }
      return criarRascunho(conta!.conta_id, {
        formato: slides.length > 1 ? "carrossel" : "post", objetivo: "vender", produto, abordagem: null, origem: "zero",
        link_url: null, prompt: null, legenda: "", template_id: "wsa-neon", mostrar_logo: false, criar_automacao: true,
      }, slides);
    },
    onSuccess: (id) => navegar(`/criar/editor/${id}`),
  });

  return (
    <section className="pagina-entra">
      <PageHeader titulo="Post com suas fotos" subtitulo="Fotos e vídeos do Banco de mídias em tela cheia, com texto opcional" icone={ImagePlus} cor="pink" />
      {demo && <Nota className="mb-5">Modo demonstração: o Banco de mídias e o rascunho não são carregados.</Nota>}

      <Card className="max-w-2xl">
        <ol className="grid gap-2 text-sub text-label2">
          <li><b className="text-label">1.</b> Escolha de 1 a {MAX_SLIDES} fotos ou vídeos. A ordem dos números é a ordem do carrossel.</li>
          <li><b className="text-label">2.</b> No editor: enquadre, ponha texto se quiser e misture com slides de template.</li>
          <li><b className="text-label">3.</b> Finalize e publique. Fotos viram JPEG; vídeos entram no carrossel como estão.</li>
        </ol>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <select aria-label="Produto (pasta do post)" className="campo max-w-64" value={produto} onChange={(e) => setProduto(e.target.value)}>
            {PRODUTOS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <Button onClick={() => setAberto(true)} disabled={demo || !conta || criar.isPending}>
            {criar.isPending ? <LoaderCircle className="animate-spin" /> : <ImagePlus />} {criar.isPending ? "Criando o rascunho…" : "Escolher fotos e vídeos"}
          </Button>
        </div>
        {criar.error && <p role="alert" className="mt-3 text-foot text-red">{(criar.error as { message?: string }).message}</p>}
      </Card>

      <SeletorMidia
        aberto={aberto}
        max={MAX_SLIDES}
        tipos={["imagem", "video", "logo"]}
        titulo="Fotos e vídeos do post"
        onFechar={() => setAberto(false)}
        onEscolher={(m) => { setAberto(false); criar.mutate(m); }}
      />
    </section>
  );
}
