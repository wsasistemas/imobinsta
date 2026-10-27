import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, LoaderCircle, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, Segmentado, Toggle } from "@/components/ui/hig";
import { useAcesso } from "@/features/auth/acesso";
import { cn } from "@/lib/utils";
import { Chip, Nota, useLargura } from "./comum";
import { chamarFuncao, criarRascunho, ErroFuncao } from "./dados";
import { type DadosSlide, PRODUTOS, type TemplateId } from "./esquema";
import { ORDEM_TEMPLATES, SlideEscala, TEMPLATES } from "./templates";

type Qualidade = "low" | "medium" | "high";
type Uso = { gasto_usd: number; teto_usd: number; confirmar_acima_usd: number; provedor_imagem: "openai" | "fal" };
type Gerada = { midia_id: string; storage_path: string; custo_usd: number; gasto_usd: number; teto_usd: number };

// Mesmas estimativas da Edge Function ia-imagem (US$ por imagem retrato).
const ESTIMATIVA: Record<Qualidade, number> = { low: 0.016, medium: 0.063, high: 0.25 };
const QUALIDADES: { valor: Qualidade; rotulo: string }[] = [
  { valor: "low", rotulo: "Rascunho" }, { valor: "medium", rotulo: "Boa" }, { valor: "high", rotulo: "Máxima" },
];
const usd = (v: number) => `US$ ${v.toFixed(v < 0.1 ? 3 : 2)}`;

/** Imagem gerada por IA (Fase 7): a IA cria a foto, o template põe título e logo por cima. */
export function IaImagem() {
  const { conta, demo } = useAcesso();
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const [ref, largura] = useLargura<HTMLDivElement>();

  const [pedido, setPedido] = useState("");
  const [qualidade, setQualidade] = useState<Qualidade>("medium");
  const [confirmar, setConfirmar] = useState<number | null>(null);
  const [gerada, setGerada] = useState<Gerada | null>(null);
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [produto, setProduto] = useState<string>(PRODUTOS[0]);
  const [template, setTemplate] = useState<TemplateId>("wsa-escuro");
  const [logo, setLogo] = useState(true);

  const uso = useQuery({
    queryKey: ["uso-ia", conta?.conta_id],
    enabled: !!conta && !demo,
    queryFn: () => chamarFuncao<Uso>("ia-imagem", { acao: "uso", conta_id: conta!.conta_id }),
  });
  const fal = uso.data?.provedor_imagem === "fal";
  const estimativa = fal ? 0.06 : ESTIMATIVA[qualidade];

  const gerar = useMutation({
    mutationFn: (confirmado: boolean) =>
      chamarFuncao<Gerada>("ia-imagem", { acao: "gerar", conta_id: conta!.conta_id, prompt: pedido, qualidade, confirmar: confirmado }),
    onMutate: () => setConfirmar(null),
    onSuccess: (r) => setGerada(r),
    onError: (e) => {
      if (e instanceof ErroFuncao && e.dados?.precisa_confirmar) setConfirmar(Number(e.dados.custo_estimado_usd) || estimativa);
    },
    onSettled: () => cliente.invalidateQueries({ queryKey: ["uso-ia"] }),
  });

  const criarPost = useMutation({
    mutationFn: () =>
      criarRascunho(conta!.conta_id, {
        formato: "post", objetivo: "vender", produto, abordagem: null, origem: "zero", link_url: null, prompt: pedido, legenda: "",
        template_id: template, mostrar_logo: logo, criar_automacao: true,
      }, [slide]),
    onSuccess: (id) => navegar(`/criar/editor/${id}`),
  });

  const slide: DadosSlide = {
    layout: "capa", titulo: titulo.trim() || "Escreva o título do post", texto: texto.trim() || undefined, posicao: "base",
    fundo_midia: gerada?.storage_path,
  };
  const pct = uso.data ? Math.min(100, (uso.data.gasto_usd / Math.max(uso.data.teto_usd, 0.01)) * 100) : 0;
  const erroGerar = gerar.error && !(gerar.error instanceof ErroFuncao && gerar.error.dados?.precisa_confirmar) ? gerar.error.message : null;

  return (
    <section className="pagina-entra">
      <PageHeader titulo="Imagem gerada por IA" subtitulo="A IA cria a foto; o template da WSA coloca título e logo por cima" icone={Sparkles} cor="indigo" />

      {demo && <Nota className="mb-5">Modo demonstração: a geração de imagem fica desligada.</Nota>}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_minmax(300px,420px)]">
        <div className="grid gap-5">
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <b>Gasto com IA paga neste mês</b>
              <span className="ml-auto text-foot text-label2">
                {uso.data ? `${usd(uso.data.gasto_usd)} de ${usd(uso.data.teto_usd)} · ${fal ? "fal.ai" : "OpenAI"}` : uso.isLoading ? "carregando…" : "—"}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-fill3" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
              <div className={cn("h-full rounded-full", pct >= 90 ? "bg-red" : pct >= 70 ? "bg-orange" : "bg-green")} style={{ width: `${pct}%` }} />
            </div>
            {uso.error && <p role="alert" className="mt-2 text-cap1 text-red">{uso.error.message}</p>}
            <p className="mt-2 text-cap1 text-label2">
              Teto, valor de confirmação e provedor ficam em <Link to="/conexoes" className="text-blue">Conexões e custos</Link>.
            </p>
          </Card>

          <Card>
            <label htmlFor="ia-pedido" className="font-semibold">Descreva a cena</label>
            <textarea id="ia-pedido" className="campo mt-3 min-h-32" maxLength={2000} value={pedido} onChange={(e) => setPedido(e.target.value)}
              placeholder="Ex.: gestora de uma imobiliária sorrindo, olhando o celular num escritório claro e moderno, fim de tarde" />
            <p className="mt-2 text-cap1 text-label2">A IA não escreve texto na imagem: o título entra pelo template, sem erro de ortografia.</p>
            {!fal && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="text-foot text-label2">Qualidade</span>
                <Segmentado rotulo="Qualidade da imagem" opcoes={QUALIDADES} valor={qualidade} onChange={setQualidade} />
              </div>
            )}
            {confirmar != null ? (
              <div className="mt-4 rounded-hig-lg bg-fill3 p-4">
                <p className="text-sub">Esta imagem custa cerca de <b>{usd(confirmar)}</b>, acima do seu limite sem confirmação. Gerar mesmo assim?</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button onClick={() => gerar.mutate(true)} disabled={gerar.isPending}>Confirmar e gerar</Button>
                  <Button variante="secundario" onClick={() => setConfirmar(null)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <Button className="mt-4" onClick={() => gerar.mutate(false)} disabled={demo || gerar.isPending || pedido.trim().length < 10}>
                {gerar.isPending ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
                {gerar.isPending ? "Gerando… (até 1 minuto)" : `${gerada ? "Gerar outra" : "Gerar imagem"} (≈ ${usd(estimativa)})`}
              </Button>
            )}
            {erroGerar && <p role="alert" className="mt-3 text-foot text-red">{erroGerar}</p>}
            {gerada && (
              <p role="status" className="mt-3 text-foot text-green">
                Imagem pronta e guardada no Banco de mídias (pasta IA). Custo: {usd(gerada.custo_usd)}.
              </p>
            )}
          </Card>

          {gerada && (
            <Card>
              <b>Texto do post</b>
              <div className="mt-3 grid gap-3 sm:grid-cols-[120px_1fr] sm:items-center">
                <label htmlFor="ia-titulo" className="text-foot text-label2">Título</label>
                <input id="ia-titulo" className="campo" maxLength={160} value={titulo} onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Use *asteriscos* para destacar" />
                <label htmlFor="ia-texto" className="text-foot text-label2">Subtítulo</label>
                <input id="ia-texto" className="campo" maxLength={300} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="opcional" />
                <span className="text-foot text-label2">Template</span>
                <span className="flex flex-wrap gap-2">
                  {ORDEM_TEMPLATES.map((t) => <Chip key={t} ativo={template === t} onClick={() => setTemplate(t)}>{TEMPLATES[t].nome}</Chip>)}
                </span>
                <label htmlFor="ia-produto" className="text-foot text-label2">Produto</label>
                <select id="ia-produto" className="campo max-w-72" value={produto} onChange={(e) => setProduto(e.target.value)}>
                  {PRODUTOS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <span className="text-foot text-label2">Logo WSA</span>
                <Toggle ligado={logo} rotulo="Mostrar logo" onChange={setLogo} />
              </div>
              {criarPost.error && <p role="alert" className="mt-3 text-foot text-red">{criarPost.error.message}</p>}
              <Button className="mt-4" onClick={() => criarPost.mutate()} disabled={!titulo.trim() || criarPost.isPending}>
                {criarPost.isPending ? <LoaderCircle className="animate-spin" /> : <ArrowRight />} Criar post com esta imagem
              </Button>
              <p className="mt-2 text-cap1 text-label2">Abre o editor; a legenda e a automação ficam na tela Publicar.</p>
            </Card>
          )}
        </div>

        <div className="lg:sticky lg:top-6">
          <p className="mb-3 text-foot text-label2">Prévia do post</p>
          <div ref={ref} className="overflow-hidden rounded-hig-xl bg-bg2 shadow-hig">
            {largura > 0 && <SlideEscala largura={largura} template={template} dados={slide} n={1} total={1} logo={logo} />}
          </div>
          {!gerada && <p className="mt-3 text-cap1 text-label2">A foto aparece aqui depois de gerada.</p>}
        </div>
      </div>
    </section>
  );
}
