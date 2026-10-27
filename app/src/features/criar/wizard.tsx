import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, DollarSign, Facebook, Globe, Heart, Instagram, LayoutGrid, Lightbulb, Link as LinkIcon, Linkedin,
  LoaderCircle, Minus, Plus, Sparkles, UserPlus, WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Toggle } from "@/components/ui/hig";
import { Tile } from "@/components/ui/tile";
import { useAcesso } from "@/features/auth/acesso";
import { type Pauta, usePauta } from "@/features/calendario/dados";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Etapas, Nota, Opcao, Rotulo } from "./comum";
import { ID_DEMO, criarRascunho } from "./dados";
import {
  ABORDAGENS, Geracao, Link, MAX_SLIDES, type Objetivo, type Origem, PRODUTOS, PromptAdaptado, type TemplateId,
} from "./esquema";
import { iaTexto } from "./ia";
import { ORDEM_TEMPLATES, SlideEscala, TEMPLATES } from "./templates";

type Rede = "todas" | "instagram" | "facebook" | "linkedin";
type Formato = { id: string; nome: string; medida: string; rede: Exclude<Rede, "todas">; selo?: string; fundo: string; formato?: "post" | "carrossel"; largo?: boolean };

const FORMATOS: Formato[] = [
  { id: "post", nome: "Post Portrait", medida: "1080 × 1350", rede: "instagram", selo: "⚡ TOP", fundo: "linear-gradient(160deg,#FF375F,#BF5AF2)", formato: "post" },
  { id: "carrossel", nome: "Carrossel Portrait", medida: "1080 × 1350 · até 10", rede: "instagram", selo: "⚡ TOP", fundo: "linear-gradient(160deg,#BF5AF2,#5E5CE6)", formato: "carrossel" },
  { id: "reels", nome: "Reels", medida: "1080 × 1920 · Fase 8", rede: "instagram", selo: "REELS", fundo: "linear-gradient(160deg,#FF453A,#FF9F0A)", largo: true },
  { id: "stories", nome: "Stories", medida: "1080 × 1920 · depois", rede: "instagram", fundo: "linear-gradient(160deg,#FF2D92,#FF375F)", largo: true },
  { id: "linkedin", nome: "Post LinkedIn", medida: "1080 × 1350 · depois", rede: "linkedin", fundo: "linear-gradient(160deg,#0A84FF,#64D2FF)" },
];

const OBJETIVOS: { valor: Objetivo; titulo: string; texto: string; icone: typeof Heart; cor: "pink" | "blue" | "green" }[] = [
  { valor: "engajar", titulo: "Engajar", texto: "Aumentar interação e comunidade", icone: Heart, cor: "pink" },
  { valor: "seguidores", titulo: "Ganhar seguidores", texto: "Conteúdo que gera compartilhamento e salvamento", icone: UserPlus, cor: "blue" },
  { valor: "vender", titulo: "Vender", texto: "Converter quem comenta em cliente, com automação no direct", icone: DollarSign, cor: "green" },
];

const ORIGENS: { valor: Origem; titulo: string; texto: string; icone: typeof Sparkles; cor: "indigo" | "teal" | "yellow"; fase?: number }[] = [
  { valor: "zero", titulo: "Do zero", texto: "Descreva a ideia e a IA escreve tudo", icone: Sparkles, cor: "indigo" },
  { valor: "link", titulo: "A partir de link", texto: "Cole uma página e a IA extrai e adapta", icone: LinkIcon, cor: "teal" },
  { valor: "pauta", titulo: "Pauta sugerida", texto: "Ideias prontas a partir dos posts que mais venderam", icone: Lightbulb, cor: "yellow", fase: 6 },
];

/** Prompt adaptado com **negrito** e marcadores, como no mockup. */
function PromptFormatado({ texto }: { texto: string }) {
  return (
    <div className="max-h-[300px] overflow-auto rounded-hig-lg bg-bg2 p-5 text-sub leading-[1.7] shadow-[inset_0_0_0_0.5px_var(--sep)]">
      {texto.split("\n").map((linha, i) => (
        <p key={i} className={cn(!linha.trim() && "h-3")}>
          {linha.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (/^\*\*.+\*\*$/.test(p) ? <b key={j} className="text-blue">{p.slice(2, -2)}</b> : p))}
        </p>
      ))}
    </div>
  );
}

/** Abre o wizard; com ?pauta=<id> (Calendário), já vem com formato, produto e ideia da pauta. */
export function WizardImagem() {
  const [busca] = useSearchParams();
  const pautaId = busca.get("pauta");
  const pauta = usePauta(pautaId);
  if (pautaId && pauta.isLoading) {
    return <div className="grid h-[60vh] place-items-center text-label2"><LoaderCircle className="size-6 animate-spin" aria-label="Carregando a pauta" /></div>;
  }
  const p = pauta.data && !pauta.data.post_id ? pauta.data : null;
  return <Wizard key={p?.id ?? "novo"} pauta={p} />;
}

/** Wizard do post de imagem: Formato → Conteúdo → Prompt adaptado → (gera e abre o Editor). */
function Wizard({ pauta }: { pauta: Pauta | null }) {
  const { demo, conta } = useAcesso();
  const navegar = useNavigate();
  const [etapa, setEtapa] = useState(0);

  const [rede, setRede] = useState<Rede>("todas");
  const [formato, setFormato] = useState<"post" | "carrossel">(pauta?.formato === "post" ? "post" : "carrossel");
  const [nSlides, setNSlides] = useState(5);
  const [template, setTemplate] = useState<TemplateId>("wsa-neon");

  const [objetivo, setObjetivo] = useState<Objetivo>("vender");
  const [produto, setProduto] = useState<string>(
    pauta?.produto && (PRODUTOS as readonly string[]).includes(pauta.produto) ? pauta.produto : PRODUTOS[0],
  );
  const [abordagem, setAbordagem] = useState<string | null>("Dor + solução");
  const [origem, setOrigem] = useState<Origem>("zero");
  const [ideia, setIdeia] = useState(pauta ? [pauta.titulo, pauta.notas].filter(Boolean).join("\n\n") : "");
  const [url, setUrl] = useState("");
  const [link, setLink] = useState<Link | null>(null);
  const [usar, setUsar] = useState({ titulo: true, descricao: true, corpo: true });
  const [instrucoes, setInstrucoes] = useState("");

  const [prompt, setPrompt] = useState("");
  const [editandoPrompt, setEditandoPrompt] = useState(false);
  const [mostrarLogo, setMostrarLogo] = useState(true);
  const [automacao, setAutomacao] = useState(true);

  const n = formato === "post" ? 1 : nSlides;
  const briefing = () => ({
    formato, n_slides: n, objetivo, produto, abordagem: abordagem ?? undefined, origem, template: TEMPLATES[template].nome,
    ideia: origem === "zero" ? ideia : undefined, instrucoes: instrucoes || undefined, criar_automacao: automacao,
    link: origem === "link" && link
      ? { url: link.url, titulo: usar.titulo ? link.titulo : undefined, descricao: usar.descricao ? link.descricao : undefined, corpo: usar.corpo ? link.corpo : undefined }
      : undefined,
  });

  const lerLink = useMutation({
    mutationFn: () => iaTexto(Link, { acao: "link", conta_id: conta!.conta_id, url: /^https?:\/\//.test(url) ? url : `https://${url}` }),
    onSuccess: setLink,
  });
  const gerarPrompt = useMutation({
    mutationFn: (base?: string) => iaTexto(PromptAdaptado, { acao: "prompt", conta_id: conta!.conta_id, briefing: briefing(), base }),
    onSuccess: (r) => setPrompt(r.prompt),
  });
  const gerar = useMutation({
    mutationFn: async () => {
      if (demo) return ID_DEMO;
      const r = await iaTexto(Geracao, { acao: "gerar", conta_id: conta!.conta_id, prompt, n_slides: n });
      const legenda = [r.legenda.trim(), r.hashtags.join(" ")].filter(Boolean).join("\n\n").slice(0, 2200);
      const id = await criarRascunho(conta!.conta_id, {
        formato, objetivo, produto, abordagem, origem, link_url: origem === "link" ? link?.url ?? null : null, prompt, legenda,
        template_id: template, mostrar_logo: mostrarLogo, criar_automacao: automacao,
      }, r.slides.slice(0, n));
      // Liga o rascunho à pauta. Se falhar, o post já existe: não perde o trabalho, só o vínculo.
      if (pauta) await supabase.from("pautas").update({ post_id: id }).eq("id", pauta.id);
      return id;
    },
    onSuccess: (id) => navegar(`/criar/editor/${id}`),
  });

  const podeConteudo = origem === "zero" ? ideia.trim().length >= 10 || instrucoes.trim().length >= 10 : origem === "link" && !!link;

  function irParaPrompt() {
    setEtapa(2);
    if (!demo && !prompt) gerarPrompt.mutate(undefined);
  }

  const resumo = [FORMATOS.find((f) => f.formato === formato)?.nome, formato === "carrossel" && `${n} slides`, OBJETIVOS.find((o) => o.valor === objetivo)?.titulo, abordagem, produto, `Template ${TEMPLATES[template].nome}`]
    .filter(Boolean).join(" · ");

  return (
    <section className="pagina-entra">
      <Etapas atual={etapa} />

      {etapa === 0 && (
        <>
          <div className="mx-auto mb-8 max-w-[820px] text-center">
            <h1 className="text-[40px]">Escolha o formato</h1>
            <p className="mt-2 text-body text-label2">Os tamanhos seguem o padrão do Instagram em 2026.</p>
          </div>
          <div className="mb-5 flex flex-wrap gap-2">
            <Chip ativo={rede === "todas"} onClick={() => setRede("todas")}><LayoutGrid />Todas</Chip>
            <Chip ativo={rede === "instagram"} onClick={() => setRede("instagram")}><Instagram />Instagram</Chip>
            <Chip ativo={rede === "facebook"} onClick={() => setRede("facebook")}><Facebook />Facebook</Chip>
            <Chip ativo={rede === "linkedin"} onClick={() => setRede("linkedin")}><Linkedin />LinkedIn</Chip>
            <Chip ativo={false} desativado>TikTok · depois</Chip>
          </div>
          <div role="radiogroup" aria-label="Formato" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {FORMATOS.filter((f) => rede === "todas" || f.rede === rede || (rede === "facebook" && f.id !== "linkedin" && !!f.formato)).map((f) => {
              const ativo = f.formato === formato;
              const Rede = f.rede === "linkedin" ? Linkedin : Instagram;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={ativo}
                  disabled={!f.formato}
                  onClick={() => f.formato && setFormato(f.formato)}
                  style={{ background: f.fundo }}
                  className={cn(
                    "relative flex aspect-[3/3.6] flex-col rounded-hig-2xl p-5 text-left text-white transition-transform duration-200 ease-apple hover:-translate-y-[3px] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0",
                    ativo && "shadow-[0_0_0_3px_var(--bg),0_0_0_6px_var(--blue)]",
                  )}
                >
                  <span className="flex items-center justify-between">
                    <Rede className="size-5" aria-hidden />
                    {f.selo && <span className="rounded-full bg-black/30 px-2.5 py-0.5 text-cap1 font-bold">{f.selo}</span>}
                  </span>
                  <span aria-hidden className={cn("m-auto h-[84px] rounded-[14px] border-[2.5px] border-white/55", f.largo ? "w-14" : "w-16")} />
                  <b className="text-body font-bold">{f.nome}</b>
                  <small className="text-foot opacity-85">{f.medida}</small>
                </button>
              );
            })}
          </div>

          {formato === "carrossel" && (
            <div className="mt-6 flex items-center gap-4">
              <span className="text-sub font-semibold">Quantidade de slides</span>
              <div className="flex items-center gap-1 rounded-full bg-fill3 p-1">
                <Button tamanho="icone" variante="simples" className="size-9" aria-label="Menos slides" disabled={nSlides <= 2} onClick={() => setNSlides((v) => v - 1)}><Minus /></Button>
                <span className="w-8 text-center text-body font-semibold tabular-nums" aria-live="polite">{nSlides}</span>
                <Button tamanho="icone" variante="simples" className="size-9" aria-label="Mais slides" disabled={nSlides >= MAX_SLIDES} onClick={() => setNSlides((v) => v + 1)}><Plus /></Button>
              </div>
            </div>
          )}

          <Rotulo>Template da WSA <small>(texto, cores e posições editáveis)</small></Rotulo>
          <div role="radiogroup" aria-label="Template" className="flex flex-wrap gap-4">
            {ORDEM_TEMPLATES.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={template === id}
                onClick={() => setTemplate(id)}
                className={cn("rounded-hig-lg bg-bg2 p-2 text-left shadow-hig transition-shadow", template === id && "ring-2 ring-blue")}
              >
                <SlideEscala largura={168} template={id} n={1} total={1} logo dados={{ layout: "capa", titulo: "Seu título com *destaque*", cta: "Comente QUERO" }} className="rounded-[10px]" />
                <span className="mt-2 block px-1 text-foot font-semibold">{TEMPLATES[id].nome}</span>
              </button>
            ))}
          </div>

          <div className="mt-7 flex justify-end">
            <Button onClick={() => setEtapa(1)}>Continuar <ArrowRight /></Button>
          </div>
        </>
      )}

      {etapa === 1 && (
        <>
          <div className="mx-auto mb-8 max-w-[820px] text-center">
            <h1 className="text-[40px]">Defina o conteúdo</h1>
            <p className="mt-2 text-body text-label2">Isso vira um prompt visual e a legenda do post.</p>
          </div>

          <Rotulo>Qual o objetivo deste post?</Rotulo>
          <div role="radiogroup" aria-label="Objetivo" className="grid gap-4 md:grid-cols-3">
            {OBJETIVOS.map((o) => (
              <Opcao key={o.valor} ativo={objetivo === o.valor} onClick={() => setObjetivo(o.valor)}>
                <Tile icone={o.icone} cor={o.cor} tamanho="lg" className="mb-4" />
                <h3 className="mb-1">{o.titulo}</h3>
                <p className="text-foot leading-normal text-label2">{o.texto}</p>
              </Opcao>
            ))}
          </div>

          <Rotulo>Produto do ecossistema <small>(o que a arte e a automação vão vender)</small></Rotulo>
          <div className="flex flex-wrap gap-2">
            {PRODUTOS.map((p) => <Chip key={p} ativo={produto === p} onClick={() => setProduto(p)}>{p}</Chip>)}
          </div>

          <Rotulo>Abordagem <small>(opcional)</small></Rotulo>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {ABORDAGENS.map((a) => (
              <Opcao key={a.valor} ativo={abordagem === a.valor} onClick={() => setAbordagem(abordagem === a.valor ? null : a.valor)} className="p-[18px] text-center">
                {a.emoji} <b>{a.valor}</b>
              </Opcao>
            ))}
          </div>

          <Rotulo>Como você quer criar?</Rotulo>
          <div role="radiogroup" aria-label="Origem" className="grid gap-4 md:grid-cols-3">
            {ORIGENS.map((o) => (
              <Opcao key={o.valor} ativo={origem === o.valor} onClick={() => setOrigem(o.valor)} desativado={!!o.fase}>
                <Tile icone={o.icone} cor={o.cor} tamanho="lg" className="mb-4" />
                <h3 className="mb-1">{o.titulo}</h3>
                <p className="text-foot leading-normal text-label2">{o.fase ? `Chega na Fase ${o.fase}.` : o.texto}</p>
              </Opcao>
            ))}
          </div>

          <Card className="mt-6 max-w-[900px]">
            {origem === "zero" ? (
              <>
                <label htmlFor="ideia" className="flex items-center gap-2 font-semibold"><Sparkles className="size-5 text-indigo" aria-hidden /> Qual é a ideia?</label>
                <textarea id="ideia" className="campo mt-3 min-h-28" value={ideia} onChange={(e) => setIdeia(e.target.value)}
                  placeholder="Ex.: mostrar que planilha e sistema isolado custam caro e que o ecossistema WSA integra tudo ao TOTVS RM." />
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Globe className="size-5" aria-hidden />
                  <b>O que usar do link?</b>
                  {link && <span className="ml-auto truncate text-label2">{new URL(link.url).hostname}</span>}
                </div>
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!demo && url.trim()) lerLink.mutate();
                  }}
                >
                  <input className="campo" type="url" inputMode="url" placeholder="https://www.wsasistemas.com.br" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Link da página" />
                  <Button type="submit" variante="secundario" disabled={demo || !url.trim() || lerLink.isPending}>
                    {lerLink.isPending ? <LoaderCircle className="animate-spin" /> : <Globe />} Ler página
                  </Button>
                </form>
                {lerLink.error && <p role="alert" className="mt-2 text-foot text-red">{lerLink.error.message}</p>}
                {link && (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {(["titulo", "descricao"] as const).map((c) => (
                      <label key={c} className="flex items-start gap-3 rounded-hig-lg border border-blue/60 bg-fill3 px-4 py-3 text-foot text-label2">
                        <input type="checkbox" className="mt-1" checked={usar[c]} onChange={(e) => setUsar({ ...usar, [c]: e.target.checked })} />
                        <span><b className="text-label">{c === "titulo" ? "Título" : "Descrição"}</b><br />{link[c] || "— (a página não tem)"}</span>
                      </label>
                    ))}
                    <label className="flex items-start gap-3 rounded-hig-lg border border-blue/60 bg-fill3 px-4 py-3 text-foot text-label2 md:col-span-2">
                      <input type="checkbox" className="mt-1" checked={usar.corpo} onChange={(e) => setUsar({ ...usar, corpo: e.target.checked })} />
                      <span><b className="text-label">Corpo da página</b><br /><span className="line-clamp-3">{link.corpo || "— (sem texto legível)"}</span></span>
                    </label>
                  </div>
                )}
              </>
            )}
            <textarea className="campo mt-3 min-h-20" placeholder="Instruções extras (opcional)" aria-label="Instruções extras" value={instrucoes} onChange={(e) => setInstrucoes(e.target.value)} />
          </Card>

          <div className="mt-7 flex justify-between">
            <Button variante="secundario" onClick={() => setEtapa(0)}><ArrowLeft /> Voltar</Button>
            <Button onClick={irParaPrompt} disabled={!demo && !podeConteudo} title={!podeConteudo ? "Descreva a ideia ou leia um link" : undefined}>Continuar <ArrowRight /></Button>
          </div>
        </>
      )}

      {etapa === 2 && (
        <>
          <Card>
            {origem === "link" && link ? (
              <>
                <b className="break-all">{link.url}</b>
                {instrucoes && <p className="mt-1.5"><b>Instruções:</b> {instrucoes}</p>}
                <div className="mt-4 border-l-[3px] border-blue pl-4 text-foot text-label2">
                  Conteúdo extraído do link<br />
                  {usar.titulo && <b className="text-label">{link.titulo}</b>}
                  {usar.descricao && <><br />{link.descricao}</>}
                </div>
              </>
            ) : (
              <>
                <b>Do zero</b>
                <p className="mt-1.5 text-sub text-label2">{ideia || instrucoes}</p>
              </>
            )}
            <p className="mt-3 text-sub text-label2">{resumo}</p>
          </Card>

          <div className="mt-6 mb-3 flex flex-wrap items-center gap-3">
            <Sparkles className="size-5 text-[#60a5fa]" aria-hidden />
            <h2>Prompt adaptado para WSA Sistemas de IA</h2>
            <div className="ml-auto flex gap-2">
              <Button variante="secundario" tamanho="sm" onClick={() => setEditandoPrompt((v) => !v)} disabled={!prompt}>{editandoPrompt ? "Ver formatado" : "Editar"}</Button>
              <Button variante="secundario" tamanho="sm" onClick={() => gerarPrompt.mutate(prompt || undefined)} disabled={demo || gerarPrompt.isPending}>
                {gerarPrompt.isPending ? <LoaderCircle className="animate-spin" /> : <WandSparkles />} {prompt ? "Refinar com IA" : "Gerar prompt"}
              </Button>
            </div>
          </div>
          {gerarPrompt.isPending && !prompt ? (
            <div className="grid h-40 place-items-center rounded-hig-lg bg-bg2 text-label2" aria-busy>
              <span className="flex items-center gap-2"><LoaderCircle className="size-5 animate-spin" /> Escrevendo o prompt com o Gemini…</span>
            </div>
          ) : editandoPrompt ? (
            <textarea className="campo min-h-[300px] leading-[1.7]" value={prompt} onChange={(e) => setPrompt(e.target.value)} aria-label="Prompt adaptado" />
          ) : prompt ? (
            <PromptFormatado texto={prompt} />
          ) : (
            <Nota>{demo ? "Modo demonstração: a IA não roda aqui. \"Gerar conteúdo\" abre o editor com um exemplo." : "Ainda sem prompt. Clique em \"Gerar prompt\" ou em \"Editar\" para escrever o seu."}</Nota>
          )}
          {gerarPrompt.error && <p role="alert" className="mt-2 text-foot text-red">{gerarPrompt.error.message}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
            <label className="flex items-center gap-3"><Toggle ligado={mostrarLogo} onChange={setMostrarLogo} rotulo="Mostrar logo" />Mostrar logo</label>
            <label className="flex items-center gap-3"><Toggle ligado={automacao} onChange={setAutomacao} rotulo="Já criar automação Chatfyre" />Já criar automação Chatfyre</label>
            <span className="ml-auto text-foot text-label2">IA de texto: Gemini (cota gratuita)</span>
          </div>
          {gerar.error && <p role="alert" className="mt-4 text-foot text-red">{gerar.error.message}</p>}

          <div className="mt-8 flex justify-between">
            <Button variante="secundario" onClick={() => setEtapa(1)}><ArrowLeft /> Voltar</Button>
            <Button onClick={() => gerar.mutate()} disabled={gerar.isPending || (!demo && prompt.trim().length < 10)}>
              {gerar.isPending ? <LoaderCircle className="animate-spin" /> : <Sparkles />} {gerar.isPending ? "Gerando slides…" : "Gerar conteúdo"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
