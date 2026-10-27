import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown, ArrowUp, Check, Download, Infinity as Infinito, LoaderCircle, Minus, Plus, Send, Trash2, Undo2, WandSparkles,
} from "lucide-react";
import { Button, botao } from "@/components/ui/button";
import { Badge, Card, Segmentado, Toggle } from "@/components/ui/hig";
import { Tile } from "@/components/ui/tile";
import { useAcesso } from "@/features/auth/acesso";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Etapas, Nota, useLargura } from "./comum";
import { ID_DEMO, type Rascunho, type SlideSalvo, useRascunho } from "./dados";
import { DadosSlide, Edicao, hashtagsDa, MAX_HASHTAGS, MAX_LEGENDA, MAX_SLIDES, slideVazio, type TemplateId } from "./esquema";
import { iaTexto } from "./ia";
import { baixar, imagemDoSlide, prepararImagens } from "./render";
import { ORDEM_TEMPLATES, Slide, SlideEscala, TEMPLATES } from "./templates";

type SlideEd = Omit<SlideSalvo, "id"> & { id: string; novo?: boolean };
type Msg = { de: "eu" | "ia"; texto: string; hora: string };
type Salvamento = "salvo" | "salvando" | "erro";

const RAPIDOS = ["Trocar texto", "Adicionar elemento", "Melhorar layout", "Trocar cor"];
const LAYOUTS: { valor: DadosSlide["layout"]; rotulo: string }[] = [
  { valor: "capa", rotulo: "Capa" }, { valor: "lista", rotulo: "Lista" }, { valor: "grade", rotulo: "Grade" }, { valor: "cta", rotulo: "CTA" },
];
const POSICOES: { valor: NonNullable<DadosSlide["posicao"]>; rotulo: string }[] = [
  { valor: "topo", rotulo: "Topo" }, { valor: "centro", rotulo: "Centro" }, { valor: "base", rotulo: "Base" },
];

const agora = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const assinatura = (s: SlideEd, ordem: number) => JSON.stringify([ordem, s.template_id, s.dados]);

export function Editor() {
  const { id } = useParams();
  const { data, isLoading, error } = useRascunho(id);
  if (isLoading) {
    return <div className="grid h-[60vh] place-items-center text-label2"><LoaderCircle className="size-6 animate-spin" aria-label="Carregando" /></div>;
  }
  if (error || !data) {
    return (
      <Card className="max-w-xl">
        <p className="font-semibold">Não foi possível abrir este post.</p>
        <p className="mt-2 text-sub text-label2">{error?.message ?? "Post não encontrado."}</p>
        <Link to="/biblioteca" className={cn(botao({ variante: "secundario" }), "mt-4")}>Voltar para a Biblioteca</Link>
      </Card>
    );
  }
  return <EditorCarregado key={data.post.id} post={data.post} inicial={data.slides} />;
}

function EditorCarregado({ post, inicial }: { post: Rascunho; inicial: SlideSalvo[] }) {
  const { demo, conta } = useAcesso();
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const somenteLeitura = post.status !== "rascunho";
  const ehDemo = post.id === ID_DEMO || demo;

  const [slides, setSlides] = useState<SlideEd[]>(inicial.length ? inicial : [{ id: `novo-${crypto.randomUUID()}`, novo: true, ordem: 1, template_id: post.template_id ?? "wsa-neon", dados: slideVazio("capa"), midia_id: null }]);
  const [atual, setAtual] = useState(0);
  const [historico, setHistorico] = useState<SlideEd[][]>([]);
  const [logo, setLogo] = useState(post.mostrar_logo);
  const [legenda, setLegenda] = useState(post.legenda ?? "");
  const [salvamento, setSalvamento] = useState<Salvamento>("salvo");
  const [msgs, setMsgs] = useState<Msg[]>([{ de: "ia", texto: "Clique em qualquer frase do slide para editar. Ou me peça: \"troca o CTA\", \"deixa o título mais curto\", \"usa laranja no destaque\".", hora: agora() }]);
  const [pedido, setPedido] = useState("");
  const [pensando, setPensando] = useState(false);
  const [exportando, setExportando] = useState<null | "baixar" | "finalizar">(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [canvasRef, larguraCanvas] = useLargura<HTMLDivElement>();
  const refsPng = useRef<(HTMLDivElement | null)[]>([]);
  const salvos = useRef(new Map(inicial.map((s) => [s.id, assinatura(s as SlideEd, s.ordem)])));
  const fimMsgs = useRef<HTMLDivElement>(null);

  const slide = slides[Math.min(atual, slides.length - 1)];

  /** Toda mudança passa por aqui: guarda o estado anterior para o "Desfazer". */
  const slidesRef = useRef(slides);
  slidesRef.current = slides;
  const mudar = useCallback((fn: (l: SlideEd[]) => SlideEd[]) => {
    if (somenteLeitura) return;
    const antes = slidesRef.current;
    const depois = fn(antes);
    slidesRef.current = depois;
    setHistorico((h) => [...h.slice(-49), antes]);
    setSlides(depois);
  }, [somenteLeitura]);

  const mudarDados = (parcial: Partial<DadosSlide>, idx = atual) =>
    mudar((l) => l.map((s, i) => (i === idx ? { ...s, dados: limpar({ ...s.dados, ...parcial }) } : s)));

  function onCampo(campo: string, valor: string) {
    if (campo.startsWith("itens.")) {
      const i = Number(campo.split(".")[1]);
      const itens = [...(slide.dados.itens ?? [])];
      if (valor) itens[i] = valor.slice(0, 60);
      else itens.splice(i, 1);
      mudarDados({ itens });
    } else if (campo === "titulo") {
      mudarDados({ titulo: valor.slice(0, 160) || "Título" });
    } else {
      mudarDados({ [campo]: valor.slice(0, campo === "cta" ? 100 : 300) || undefined } as Partial<DadosSlide>);
    }
  }

  // ---- Salvamento automático (diferença contra o que já está no banco) ----
  useEffect(() => {
    if (ehDemo || somenteLeitura) return;
    const pendentes = slides.some((s, i) => salvos.current.get(s.id) !== assinatura(s, i + 1)) ||
      [...salvos.current.keys()].some((id) => !slides.find((s) => s.id === id));
    if (!pendentes) return;
    setSalvamento("salvando");
    const t = setTimeout(async () => {
      try {
        const removidos = [...salvos.current.keys()].filter((id) => !slides.find((s) => s.id === id));
        if (removidos.length) {
          const { error } = await supabase.from("post_slides").delete().in("id", removidos);
          if (error) throw error;
          removidos.forEach((id) => salvos.current.delete(id));
        }
        for (const [i, s] of slides.entries()) {
          const ass = assinatura(s, i + 1);
          if (salvos.current.get(s.id) === ass) continue;
          const linha = { ordem: i + 1, template_id: s.template_id, dados_json: s.dados, atualizado_em: new Date().toISOString() };
          if (s.novo) {
            const { data, error } = await supabase.from("post_slides").insert({ ...linha, post_id: post.id }).select("id").single();
            if (error) throw error;
            salvos.current.set(data.id, ass);
            setSlides((l) => l.map((x) => (x.id === s.id ? { ...x, id: data.id, novo: false } : x)));
            setHistorico((h) => h.map((foto) => foto.map((x) => (x.id === s.id ? { ...x, id: data.id, novo: false } : x))));
          } else {
            const { error } = await supabase.from("post_slides").update(linha).eq("id", s.id);
            if (error) throw error;
            salvos.current.set(s.id, ass);
          }
        }
        setSalvamento("salvo");
      } catch {
        setSalvamento("erro");
      }
    }, 800);
    return () => clearTimeout(t);
  }, [slides, ehDemo, somenteLeitura, post.id]);

  async function salvarPost(campos: Partial<Pick<Rascunho, "legenda" | "mostrar_logo">>) {
    if (ehDemo || somenteLeitura) return;
    setSalvamento("salvando");
    const { error } = await supabase.from("posts").update(campos).eq("id", post.id);
    setSalvamento(error ? "erro" : "salvo");
  }

  // ---- Chat IA ----
  async function enviarPedido(texto: string) {
    const p = texto.trim();
    if (!p || pensando || somenteLeitura) return;
    setPedido("");
    setMsgs((m) => [...m, { de: "eu", texto: p, hora: agora() }]);
    if (ehDemo) {
      setMsgs((m) => [...m, { de: "ia", texto: "Modo demonstração: a IA não roda aqui. Edite clicando no texto do slide.", hora: agora() }]);
      return;
    }
    setPensando(true);
    const idx = atual;
    try {
      const r = await iaTexto(Edicao, {
        acao: "editar", conta_id: conta!.conta_id, post_id: post.id, slide: slides[idx].dados, pedido: p, n: idx + 1, total: slides.length,
      });
      const novo = DadosSlide.safeParse(limpar({ ...slides[idx].dados, ...r.alteracoes }));
      if (!novo.success) throw new Error("A alteração sugerida saiu do formato do template. Peça de outro jeito.");
      if (Object.keys(r.alteracoes).length) mudar((l) => l.map((s, i) => (i === idx ? { ...s, dados: novo.data } : s)));
      setMsgs((m) => [...m, { de: "ia", texto: r.resposta, hora: agora() }]);
    } catch (e) {
      setMsgs((m) => [...m, { de: "ia", texto: `⚠️ ${(e as Error).message}`, hora: agora() }]);
    } finally {
      setPensando(false);
    }
  }
  useEffect(() => {
    fimMsgs.current?.scrollIntoView({ block: "end" }); // no Chromium novo devolve Promise: não pode ser o retorno do efeito
  }, [msgs, pensando]);

  // ---- Slides ----
  function adicionar() {
    if (slides.length >= MAX_SLIDES) return;
    mudar((l) => [...l, { id: `novo-${crypto.randomUUID()}`, novo: true, ordem: l.length + 1, template_id: slide.template_id, dados: slideVazio(), midia_id: null }]);
    setAtual(slides.length);
  }
  function remover() {
    if (slides.length <= 1) return;
    mudar((l) => l.filter((_, i) => i !== atual));
    setAtual((a) => Math.max(0, a - 1));
  }
  function mover(delta: -1 | 1) {
    const destino = atual + delta;
    if (destino < 0 || destino >= slides.length) return;
    mudar((l) => {
      const c = [...l];
      [c[atual], c[destino]] = [c[destino], c[atual]];
      return c;
    });
    setAtual(destino);
  }
  function desfazer() {
    const anterior = historico.at(-1);
    if (!anterior) return;
    // ids de slides novos que já foram gravados continuam valendo (o salvamento troca o id na foto também)
    slidesRef.current = anterior;
    setSlides(anterior);
    setHistorico(historico.slice(0, -1));
    setAtual((a) => Math.min(a, anterior.length - 1));
  }
  function trocarTemplate(t: TemplateId) {
    mudar((l) => l.map((s) => ({ ...s, template_id: t })));
  }

  // ---- PNG ----
  async function exportar(modo: "baixar" | "finalizar") {
    setAviso(null);
    setExportando(modo);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); // espera o render oculto montar
    try {
      if (modo === "baixar") {
        const no = refsPng.current[atual];
        if (!no) throw new Error("Slide não encontrado.");
        baixar(await imagemDoSlide(no, "png"), `wsa-slide-${atual + 1}.png`);
      } else {
        if (ehDemo) throw new Error("Modo demonstração: o PNG não é salvo no banco de mídias.");
        if (salvamento !== "salvo" || slides.some((s) => s.novo)) throw new Error("Aguarde o salvamento terminar e clique de novo.");
        const ids = await prepararImagens({
          contaId: conta!.conta_id, postId: post.id, pasta: post.produto ?? "Posts", slides, nos: refsPng.current,
        });
        setSlides((l) => l.map((x, i) => ({ ...x, midia_id: ids[i] ?? x.midia_id })));
        await Promise.all(["midias", "posts", "rascunho"].map((k) => cliente.invalidateQueries({ queryKey: [k] })));
        navegar(`/criar/publicar/${post.id}`);
      }
    } catch (e) {
      setAviso(`⚠️ ${(e as Error).message}`);
    } finally {
      setExportando(null);
    }
  }

  const larguraSlide = Math.max(240, Math.min(460, larguraCanvas - 48));
  const tags = hashtagsDa(legenda);

  return (
    <section className="pagina-entra">
      <Etapas atual={3} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variante="secundario" onClick={desfazer} disabled={!historico.length || somenteLeitura}><Undo2 /> Desfazer</Button>
        <Badge tom="ok"><Infinito /> Edições ilimitadas</Badge>
        <span className={cn("flex items-center gap-1.5 text-foot", salvamento === "erro" ? "text-red" : "text-green")} aria-live="polite">
          {salvamento === "salvando" ? <><LoaderCircle className="size-3.5 animate-spin" /> Salvando…</>
            : salvamento === "erro" ? "Erro ao salvar. Confira a conexão."
            : ehDemo ? "Modo demonstração (nada é salvo)"
            : <><Check className="size-3.5" /> Todas as alterações salvas</>}
        </span>
        <div className="ml-auto flex gap-3">
          <Button variante="secundario" onClick={() => exportar("baixar")} disabled={!!exportando}>
            {exportando === "baixar" ? <LoaderCircle className="animate-spin" /> : <Download />} Baixar PNG
          </Button>
          {somenteLeitura ? (
            <Link to={`/criar/publicar/${post.id}`} className={botao()}><Send /> Ver publicação</Link>
          ) : (
            <Button onClick={() => exportar("finalizar")} disabled={!!exportando}>
              {exportando === "finalizar" ? <LoaderCircle className="animate-spin" /> : <Check />} Finalizar
            </Button>
          )}
        </div>
      </div>
      {somenteLeitura && <Nota className="mb-4">Este post já saiu do rascunho ({post.status}). Só dá para ver e baixar.</Nota>}
      {aviso && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-hig-lg bg-fill3 px-4 py-3 text-foot">
          <span className="flex-1">{aviso}</span>
                  </div>
      )}

      <div className="grid overflow-hidden rounded-hig-2xl bg-bg2 shadow-hig lg:min-h-[720px] lg:grid-cols-[104px_1fr_380px]">
        {/* Lista de slides */}
        <div className="flex gap-3 overflow-x-auto border-b border-sep p-3 lg:flex-col lg:overflow-x-visible lg:border-r lg:border-b-0" aria-label="Slides">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setAtual(i)}
              aria-label={`Slide ${i + 1}`}
              aria-current={i === atual}
              className={cn("relative flex-none overflow-hidden rounded-hig-sm shadow-[0_0_0_0.5px_var(--sep)]", i === atual && "shadow-[0_0_0_2px_var(--bg2),0_0_0_4px_var(--blue)]")}
            >
              <SlideEscala largura={80} template={s.template_id} dados={s.dados} n={i + 1} total={slides.length} logo={logo} />
              <span className="absolute bottom-1 left-1.5 text-[11px] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">{i + 1}</span>
            </button>
          ))}
          {slides.length < MAX_SLIDES && !somenteLeitura && (
            <button type="button" onClick={adicionar} aria-label="Adicionar slide" className="grid aspect-[4/5] w-20 flex-none place-items-center rounded-hig-sm border-[1.5px] border-dashed border-[var(--g3)] text-label2 hover:text-blue">
              <Plus className="size-5" />
            </button>
          )}
        </div>

        {/* Canvas */}
        <div ref={canvasRef} className="flex flex-col items-center gap-4 bg-bg p-4 md:p-6">
          {!somenteLeitura && (
            <div className="flex w-full flex-wrap items-center justify-center gap-2">
              <Segmentado rotulo="Layout do slide" opcoes={LAYOUTS} valor={slide.dados.layout} onChange={(layout) => mudarDados({ layout })} />
              <Segmentado rotulo="Posição do conteúdo" opcoes={POSICOES} valor={slide.dados.posicao ?? "centro"} onChange={(posicao) => mudarDados({ posicao })} />
            </div>
          )}
          <SlideEscala
            largura={larguraSlide}
            template={slide.template_id}
            dados={slide.dados}
            n={atual + 1}
            total={slides.length}
            logo={logo}
            editavel={!somenteLeitura}
            onCampo={onCampo}
            className="rounded-hig-sm shadow-[0_20px_50px_rgba(0,0,0,0.45)]"
          />
          {!somenteLeitura && (
            <div className="flex w-full flex-wrap items-center justify-center gap-2 text-foot">
              {(slide.dados.layout === "lista" || slide.dados.layout === "grade") && (
                <>
                  <Button tamanho="sm" variante="secundario" disabled={(slide.dados.itens?.length ?? 0) >= 8} onClick={() => mudarDados({ itens: [...(slide.dados.itens ?? []), "Novo item"] })}><Plus /> Item</Button>
                  <Button tamanho="sm" variante="secundario" disabled={!slide.dados.itens?.length} onClick={() => mudarDados({ itens: slide.dados.itens?.slice(0, -1) })}><Minus /> Item</Button>
                </>
              )}
              {!slide.dados.texto && <Button tamanho="sm" variante="secundario" onClick={() => mudarDados({ texto: "Texto de apoio" })}><Plus /> Texto</Button>}
              {!slide.dados.cta && <Button tamanho="sm" variante="secundario" onClick={() => mudarDados({ cta: "Comente QUERO" })}><Plus /> CTA</Button>}
              <label className="flex items-center gap-2 rounded-full bg-fill2 px-3 py-1">
                Destaque
                <input type="color" aria-label="Cor de destaque" className="size-6 cursor-pointer rounded border-0 bg-transparent"
                  value={slide.dados.cor_destaque ?? TEMPLATES[slide.template_id].destaque}
                  onChange={(e) => mudarDados({ cor_destaque: e.target.value })} />
              </label>
              <Button tamanho="sm" variante="simples" onClick={() => mover(-1)} disabled={atual === 0} aria-label="Mover slide para trás"><ArrowUp /></Button>
              <Button tamanho="sm" variante="simples" onClick={() => mover(1)} disabled={atual === slides.length - 1} aria-label="Mover slide para frente"><ArrowDown /></Button>
              <Button tamanho="sm" variante="simples" className="text-red" onClick={remover} disabled={slides.length <= 1} aria-label="Apagar slide"><Trash2 /></Button>
            </div>
          )}
        </div>

        {/* Chat IA */}
        <div className="flex min-h-[420px] flex-col border-t border-sep lg:border-t-0 lg:border-l">
          <div className="flex items-center gap-3 border-b border-sep p-4">
            <Tile icone={WandSparkles} cor="indigo" tamanho="lg" />
            <div><b>Editor IA</b><br /><small className="text-label2">Edita textos, cores e layout do template</small></div>
          </div>
          <div className="bg-tint px-4 py-2 text-foot font-medium text-blue">🎨 Editando: Slide {atual + 1}</div>
          <div className="flex max-h-[420px] flex-1 flex-col gap-3 overflow-auto p-4" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={cn("flex", m.de === "eu" && "justify-end")}>
                {m.de === "eu" ? (
                  <p className="max-w-[85%] rounded-[18px_18px_4px_18px] bg-blue px-3.5 py-2.5 text-sub leading-snug text-white">{m.texto}</p>
                ) : (
                  <div>
                    <span className="text-cap1 font-semibold text-label2">Editor IA</span>
                    <p className="mt-0.5 rounded-[18px_18px_18px_4px] bg-fill3 px-3.5 py-2.5 text-sub leading-snug">{m.texto}</p>
                    <small className="text-cap2 text-label2">{m.hora}</small>
                  </div>
                )}
              </div>
            ))}
            {pensando && <p className="flex items-center gap-2 text-foot text-label2"><LoaderCircle className="size-4 animate-spin" /> Editando…</p>}
            <div ref={fimMsgs} />
          </div>
          <div className="flex gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none]">
            {RAPIDOS.map((r) => (
              <button key={r} type="button" onClick={() => setPedido(`${r}: `)} className="min-h-8 rounded-full bg-fill3 px-3 text-foot font-medium whitespace-nowrap">{r}</button>
            ))}
          </div>
          <form className="flex items-center gap-2 border-t border-sep px-4 py-3" onSubmit={(e) => { e.preventDefault(); enviarPedido(pedido); }}>
            <input className="campo rounded-full" placeholder="Peça alterações no design..." value={pedido} onChange={(e) => setPedido(e.target.value)} aria-label="Pedido para o Editor IA" disabled={somenteLeitura} />
            <Button type="submit" tamanho="icone" aria-label="Enviar" disabled={!pedido.trim() || pensando || somenteLeitura}><Send /></Button>
          </form>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <h3>Legenda</h3>
            <span className={cn("ml-auto text-foot tabular-nums", legenda.length > MAX_LEGENDA ? "text-red" : "text-label2")}>{legenda.length.toLocaleString("pt-BR")} / 2.200</span>
            <span className={cn("text-foot", tags.length > MAX_HASHTAGS ? "text-red" : "text-label2")}>{tags.length}/{MAX_HASHTAGS} hashtags</span>
          </div>
          <textarea
            className="campo mt-3 min-h-40 leading-normal"
            value={legenda}
            maxLength={MAX_LEGENDA}
            readOnly={somenteLeitura}
            aria-label="Legenda do post"
            onChange={(e) => setLegenda(e.target.value)}
            onBlur={() => legenda !== (post.legenda ?? "") && salvarPost({ legenda })}
          />
          {tags.length > MAX_HASHTAGS && <p className="mt-2 text-foot text-red">O Instagram aceita, mas o estúdio limita a {MAX_HASHTAGS} hashtags. Tire {tags.length - MAX_HASHTAGS}.</p>}
        </Card>
        <Card className="flex flex-col gap-4">
          <h3>Visual</h3>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Template">
            {ORDEM_TEMPLATES.map((t) => (
              <button key={t} type="button" role="radio" aria-checked={slide.template_id === t} disabled={somenteLeitura} onClick={() => trocarTemplate(t)}
                className={cn("flex items-center gap-2 rounded-full bg-fill3 py-1 pr-3 pl-1 text-foot font-medium", slide.template_id === t && "bg-label text-bg")}>
                <span className="size-6 rounded-full" style={{ background: TEMPLATES[t].amostra }} aria-hidden />{TEMPLATES[t].nome}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-3">
            <Toggle ligado={logo} rotulo="Mostrar logo" onChange={(v) => { if (somenteLeitura) return; setLogo(v); salvarPost({ mostrar_logo: v }); }} />
            Mostrar logo
          </label>
        </Card>
      </div>

      <Nota className="mt-4">
        Como fica grátis: o slide é um <b>template HTML</b> da WSA; a IA só troca textos, cores e posições (JSON). A imagem final sai por render do navegador. Nenhum crédito de geração de imagem é gasto.
      </Nota>

      {/* Slides em tamanho real, fora da tela, só durante a exportação */}
      {exportando && (
        <div aria-hidden style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}>
          {slides.map((s, i) => (
            <Slide key={s.id} ref={(el) => { refsPng.current[i] = el; }} template={s.template_id} dados={s.dados} n={i + 1} total={slides.length} logo={logo} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Tira campos vazios (o template some com o bloco) e mantém o JSON no formato do esquema. */
function limpar(d: DadosSlide): DadosSlide {
  const c = { ...d };
  if (!c.texto) delete c.texto;
  if (!c.cta) delete c.cta;
  if (!c.itens?.length) delete c.itens;
  return c;
}
