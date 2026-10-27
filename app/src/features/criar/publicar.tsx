import { useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark, CalendarClock, ChevronLeft, ChevronRight, ExternalLink, Heart, Instagram, LoaderCircle, MessageCircle,
  MoreHorizontal, Pencil, Save, Send, Undo2, Zap,
} from "lucide-react";
import { Button, botao } from "@/components/ui/button";
import { Badge, Card, Toggle } from "@/components/ui/hig";
import { useAcesso } from "@/features/auth/acesso";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Chip, Etapas, Nota, useLargura } from "./comum";
import { AUTOMACAO_PADRAO, type AutomacaoConfig, chamarFuncao, ID_DEMO, type Rascunho, type SlideSalvo, useRascunho } from "./dados";
import { hashtagsDa, MAX_HASHTAGS, MAX_LEGENDA } from "./esquema";
import { prepararImagens } from "./render";
import { Slide, SlideEscala } from "./templates";

type Quando = "agora" | "agendar";
type Etapa = null | "salvando" | "imagens" | "enviando";

/** Amanhã às 12:00, no formato do input datetime-local. */
function amanhaMeioDia() {
  const d = new Date(Date.now() + 24 * 3600_000);
  d.setHours(12, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T12:00`;
}

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function Publicar() {
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
  return <PublicarCarregado key={data.post.id} post={data.post} slides={data.slides} />;
}

function PublicarCarregado({ post, slides }: { post: Rascunho; slides: SlideSalvo[] }) {
  const { demo, conta } = useAcesso();
  const cliente = useQueryClient();
  const ehDemo = post.id === ID_DEMO || demo;
  const rascunho = post.status === "rascunho";

  const [legenda, setLegenda] = useState(post.legenda ?? "");
  const [comAutomacao, setComAutomacao] = useState(post.criar_automacao);
  const [auto, setAuto] = useState<AutomacaoConfig>({ ...AUTOMACAO_PADRAO, ...(post.automacao_json ?? {}) });
  const [quando, setQuando] = useState<Quando>("agora");
  const [horario, setHorario] = useState(amanhaMeioDia);
  const [confirmar, setConfirmar] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>(null);
  const [feitos, setFeitos] = useState(0);
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const nos = useRef<(HTMLDivElement | null)[]>([]);

  const tags = hashtagsDa(legenda);
  const reels = post.formato === "reels";
  const problemas = [
    reels && !post.video_midia_id && "O Reels não tem vídeo.",
    !reels && !slides.length && "O post não tem slides.",
    post.formato === "post" && slides.length !== 1 && "Post único precisa de exatamente 1 slide.",
    post.formato === "carrossel" && (slides.length < 2 || slides.length > 10) && "Carrossel precisa de 2 a 10 slides.",
    legenda.length > MAX_LEGENDA && "A legenda passou de 2.200 caracteres.",
    tags.length > MAX_HASHTAGS && `Tire ${tags.length - MAX_HASHTAGS} hashtag(s): o limite do estúdio é ${MAX_HASHTAGS}.`,
    comAutomacao && !auto.palavra.trim() && "Defina a palavra-chave da automação.",
    comAutomacao && (!auto.dm.trim() || !auto.botao.trim()) && "A automação precisa da DM de boas-vindas e do texto do botão.",
    comAutomacao && !/^https:\/\/\S+$/.test(auto.link.trim()) && "Defina o link da automação (https://…).",
  ].filter(Boolean) as string[];

  async function atualizarListas() {
    await Promise.all(["rascunho", "posts"].map((k) => cliente.invalidateQueries({ queryKey: [k] })));
  }

  async function salvarRascunho() {
    const { error } = await supabase
      .from("posts")
      .update({ legenda, criar_automacao: comAutomacao, automacao_json: comAutomacao ? auto : null })
      .eq("id", post.id);
    if (error) throw new Error(error.message);
  }

  async function executar(fn: () => Promise<string>) {
    setAviso(null);
    try {
      setAviso({ tom: "ok", texto: await fn() });
    } catch (e) {
      setAviso({ tom: "erro", texto: (e as Error).message });
    } finally {
      setEtapa(null);
      setConfirmar(false);
      await atualizarListas();
    }
  }

  const salvar = () => executar(async () => {
    if (ehDemo) throw new Error("Modo demonstração: nada é salvo.");
    setEtapa("salvando");
    await salvarRascunho();
    return "Rascunho salvo.";
  });

  const enviar = () => executar(async () => {
    if (ehDemo) throw new Error("Modo demonstração: nada é publicado.");
    setEtapa("salvando");
    await salvarRascunho();
    if (!reels) {
      setEtapa("imagens");
      setFeitos(0);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); // espera os slides ocultos montarem
      await prepararImagens({
        contaId: conta!.conta_id, postId: post.id, pasta: post.produto ?? "Posts", slides, nos: nos.current, aoAvancar: setFeitos,
      });
    }
    setEtapa("enviando");
    if (quando === "agendar") {
      const r = await chamarFuncao<{ agendado_para: string }>("ig-publicar", {
        acao: "agendar", conta_id: conta!.conta_id, post_id: post.id, quando: new Date(horario).toISOString(),
      });
      return `Agendado para ${dataHora(r.agendado_para)}. A fila confere a cada 5 minutos.`;
    }
    const r = await chamarFuncao<{ status: string; permalink?: string; processando?: boolean; automacao?: { status: string; erro?: string | null } | null }>("ig-publicar", {
      acao: "publicar", conta_id: conta!.conta_id, post_id: post.id,
    });
    if (r.processando) return "O Instagram está processando o vídeo. O Reels sai sozinho em alguns minutos (a fila confere a cada 5 min) e a automação é criada em seguida.";
    const texto = r.permalink ? "Publicado no Instagram." : "Publicado no Instagram (o link aparece na próxima sincronização).";
    if (!r.automacao) return texto;
    if (r.automacao.status === "erro") throw new Error(`${texto} Mas a automação falhou: ${r.automacao.erro ?? "sem detalhe"}. Tente de novo em Automações.`);
    return `${texto} Automação criada e pausada: ative em Automações.`;
  });

  const voltarRascunho = () => executar(async () => {
    setEtapa("enviando");
    await chamarFuncao("ig-publicar", { acao: "rascunho", conta_id: conta!.conta_id, post_id: post.id });
    return "O post voltou para rascunho. Edite e publique de novo quando quiser.";
  });

  const ocupado = etapa !== null;
  const textoEtapa =
    etapa === "salvando" ? "Salvando…"
    : etapa === "imagens" ? `Preparando imagens ${feitos}/${slides.length}…`
    : etapa === "enviando" ? (quando === "agendar" ? "Agendando…" : "Publicando no Instagram…")
    : null;

  return (
    <section className="pagina-entra">
      <Etapas atual={4} />

      <StatusPost post={post} ocupado={ocupado} onVoltar={voltarRascunho} />
      {aviso && (
        <div role={aviso.tom === "erro" ? "alert" : "status"}
          className={cn("mb-4 rounded-hig-lg px-4 py-3 text-foot", aviso.tom === "erro" ? "bg-red/10 text-red" : "bg-green/10 text-green")}>
          {aviso.texto}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(320px,440px)_1fr]">
        <PreviewInstagram post={post} slides={slides} legenda={legenda} usuario={conta?.ig_username ?? "wsasistemas.ia"} />

        <div className="grid gap-5">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <span className="size-2 rounded-full bg-blue" aria-hidden />
              <h3>Legenda final</h3>
              <Badge tom="instagram" className="ml-auto"><Instagram /> instagram</Badge>
            </div>
            <textarea
              className="campo mt-3 min-h-44 leading-normal"
              value={legenda}
              maxLength={MAX_LEGENDA}
              readOnly={!rascunho}
              aria-label="Legenda final"
              onChange={(e) => setLegenda(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3 text-foot">
              <span className={cn("tabular-nums", legenda.length > MAX_LEGENDA ? "text-red" : "text-label2")}>
                {legenda.length.toLocaleString("pt-BR")}/2.200 caracteres · {tags.length}/{MAX_HASHTAGS} hashtags
              </span>
              {rascunho && (
                <Link to={`/criar/editor/${post.id}`} className="ml-auto inline-flex items-center gap-1.5 text-blue">
                  <Pencil className="size-4" aria-hidden /> Voltar ao editor
                </Link>
              )}
            </div>
          </Card>

          <PainelAutomacao ligado={comAutomacao} onLigado={setComAutomacao} auto={auto} onAuto={setAuto} editavel={rascunho} />

          {rascunho && (
            <Card>
              <b>Quando publicar?</b>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Chip ativo={quando === "agora"} onClick={() => { setQuando("agora"); setConfirmar(false); }}>Agora</Chip>
                <Chip ativo={quando === "agendar"} onClick={() => { setQuando("agendar"); setConfirmar(false); }}><CalendarClock /> Agendar</Chip>
                {quando === "agendar" && (
                  <input type="datetime-local" className="campo max-w-[240px] min-h-9 py-1.5 text-foot" value={horario}
                    onChange={(e) => setHorario(e.target.value)} aria-label="Data e hora da publicação" />
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-foot text-label2">
                <span className="inline-flex items-center gap-2"><Instagram className="size-4 text-pink" aria-hidden /> Instagram @{conta?.ig_username ?? "wsasistemas.ia"}</span>
                <span>Facebook e LinkedIn: depois do Instagram estável</span>
              </div>

              {problemas.length > 0 && (
                <ul className="mt-4 list-disc pl-5 text-foot text-red">{problemas.map((p) => <li key={p}>{p}</li>)}</ul>
              )}

              {confirmar ? (
                <div className="mt-4 rounded-hig-lg bg-fill3 p-4">
                  <p className="text-sub">
                    Publicar agora no <b>@{conta?.ig_username ?? "wsasistemas.ia"}</b>? O post fica público na hora e só pode ser apagado pelo app do Instagram.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Button onClick={enviar} disabled={ocupado}>{ocupado ? <LoaderCircle className="animate-spin" /> : <Send />} {textoEtapa ?? "Confirmar e publicar"}</Button>
                    <Button variante="secundario" onClick={() => setConfirmar(false)} disabled={ocupado}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Button className="min-h-13" disabled={ocupado || problemas.length > 0 || ehDemo}
                    onClick={() => (quando === "agora" ? setConfirmar(true) : enviar())}>
                    {ocupado && etapa !== "salvando" ? <LoaderCircle className="animate-spin" /> : quando === "agora" ? <Send /> : <CalendarClock />}
                    {(etapa !== "salvando" && textoEtapa) || (quando === "agora" ? "Publicar agora" : "Agendar publicação")}
                  </Button>
                  <Button variante="secundario" className="min-h-13" onClick={salvar} disabled={ocupado || ehDemo}>
                    {etapa === "salvando" ? <LoaderCircle className="animate-spin" /> : <Save />} Salvar rascunho
                  </Button>
                </div>
              )}
              <p className="mt-3 text-cap1 text-label2">
                Publica pela API oficial do Instagram (grátis) e recebe o media_id. A automação do Chatfyre é criada depois, já ligada a esse post, e nasce pausada.
              </p>
              {ehDemo && <Nota className="mt-3">Modo demonstração: publicar e salvar ficam desligados.</Nota>}
            </Card>
          )}
        </div>
      </div>

      {/* Slides em tamanho real, fora da tela, só enquanto as imagens são geradas */}
      {etapa === "imagens" && (
        <div aria-hidden style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}>
          {slides.map((s, i) => (
            <Slide key={s.id} ref={(el) => { nos.current[i] = el; }} template={s.template_id} dados={s.dados} n={i + 1} total={slides.length} logo={post.mostrar_logo} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Faixa de status para post que já saiu do rascunho. */
function StatusPost({ post, ocupado, onVoltar }: { post: Rascunho; ocupado: boolean; onVoltar: () => void }) {
  if (post.status === "rascunho") return null;
  const base = "mb-4 flex flex-wrap items-center gap-3 rounded-hig-lg px-4 py-3 text-sub";
  if (post.status === "publicado") {
    return (
      <div role="status" className={cn(base, "bg-green/10")}>
        <span className="flex-1 text-green">Publicado no Instagram.</span>
        {post.permalink && (
          <a href={post.permalink} target="_blank" rel="noreferrer" className={botao({ tamanho: "sm", variante: "secundario" })}>
            <ExternalLink /> Ver no Instagram
          </a>
        )}
      </div>
    );
  }
  if (post.status === "agendado") {
    return (
      <div role="status" className={cn(base, "bg-orange/10")}>
        <CalendarClock className="size-5 text-orange" aria-hidden />
        <span className="flex-1">Agendado para <b>{post.agendado_para ? dataHora(post.agendado_para) : "—"}</b>. A fila confere a cada 5 minutos.</span>
        <Button tamanho="sm" variante="secundario" onClick={onVoltar} disabled={ocupado}><Undo2 /> Cancelar agendamento</Button>
      </div>
    );
  }
  if (post.status === "publicando") {
    return (
      <div role="status" className={cn(base, "bg-fill3")}>
        <LoaderCircle className="size-5 animate-spin" aria-hidden /> Publicando no Instagram… atualize em instantes.
      </div>
    );
  }
  return (
    <div role="alert" className={cn(base, "bg-red/10")}>
      <span className="flex-1 text-red">A publicação falhou: {post.erro ?? "sem detalhe"}</span>
      <Button tamanho="sm" variante="secundario" onClick={onVoltar} disabled={ocupado}><Undo2 /> Voltar para rascunho</Button>
    </div>
  );
}

/** Reels: o vídeo do bucket privado por URL assinada (1 h). */
function VideoReels({ caminho }: { caminho: string }) {
  const url = useQuery({
    queryKey: ["video-url", caminho],
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("imobinsta-midias").createSignedUrl(caminho, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  if (!url.data) return <div className="grid aspect-[9/16] place-items-center bg-black text-label2"><LoaderCircle className="size-6 animate-spin" /></div>;
  return <video src={url.data} controls playsInline className="aspect-[9/16] w-full bg-black" />;
}

/** Preview no formato do feed do Instagram, com as setas do carrossel (ou o vídeo do Reels). */
function PreviewInstagram({ post, slides, legenda, usuario }: { post: Rascunho; slides: SlideSalvo[]; legenda: string; usuario: string }) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [i, setI] = useState(0);
  const [inteira, setInteira] = useState(false);
  const atual = slides[Math.min(i, slides.length - 1)];
  const curta = legenda.length > 125 && !inteira;
  return (
    <div>
      <p className="mb-3 flex items-center gap-2 text-foot text-label2"><span className="size-2 rounded-full bg-blue" aria-hidden /> Preview do post</p>
      <div ref={ref} className="overflow-hidden rounded-hig-xl bg-bg2 shadow-hig">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="grid size-9 place-items-center rounded-full bg-[conic-gradient(#f58529,#dd2a7b,#8134af,#515bd4,#f58529)] p-[2px]">
            <span className="size-full rounded-full border-2 border-bg2 bg-blue" />
          </span>
          <div className="leading-tight">
            <b className="text-foot">{usuario}</b>
            <small className="block text-cap1 text-label2">{post.formato === "carrossel" ? `Carrossel · ${i + 1}/${slides.length}` : post.formato === "reels" ? "Reels" : "Post"}</small>
          </div>
          <MoreHorizontal className="ml-auto size-5 text-label2" aria-hidden />
        </div>
        <div className="relative">
          {post.formato === "reels" && post.midias?.storage_path && <VideoReels caminho={post.midias.storage_path} />}
          {post.formato !== "reels" && atual && largura > 0 && (
            <SlideEscala largura={largura} template={atual.template_id} dados={atual.dados} n={i + 1} total={slides.length} logo={post.mostrar_logo} />
          )}
          {slides.length > 1 && (
            <>
              <button type="button" aria-label="Slide anterior" disabled={i === 0} onClick={() => setI(i - 1)}
                className="absolute top-1/2 left-2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black disabled:opacity-0">
                <ChevronLeft className="size-5" />
              </button>
              <button type="button" aria-label="Próximo slide" disabled={i >= slides.length - 1} onClick={() => setI(i + 1)}
                className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black disabled:opacity-0">
                <ChevronRight className="size-5" />
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-4 px-4 pt-3">
          <Heart className="size-6" aria-hidden /><MessageCircle className="size-6" aria-hidden /><Send className="size-6" aria-hidden />
          {slides.length > 1 && (
            <span className="mx-auto flex gap-1" aria-hidden>
              {slides.map((s, k) => <span key={s.id} className={cn("size-1.5 rounded-full", k === i ? "bg-blue" : "bg-label3")} />)}
            </span>
          )}
          <Bookmark className={cn("size-6", slides.length <= 1 && "ml-auto")} aria-hidden />
        </div>
        <p className="px-4 pt-2 pb-4 text-foot leading-normal whitespace-pre-line">
          <b>{usuario}</b> {curta ? `${legenda.slice(0, 125).trimEnd()}… ` : legenda}
          {curta && <button type="button" className="text-label2" onClick={() => setInteira(true)}>mais</button>}
        </p>
      </div>
    </div>
  );
}

/** Configuração da automação comentário → DM. Fica no rascunho; o Chatfyre só recebe depois de publicar. */
function PainelAutomacao({ ligado, onLigado, auto, onAuto, editavel }: {
  ligado: boolean; onLigado: (v: boolean) => void; auto: AutomacaoConfig; onAuto: (a: AutomacaoConfig) => void; editavel: boolean;
}) {
  const campo = <K extends keyof AutomacaoConfig>(k: K, v: AutomacaoConfig[K]) => onAuto({ ...auto, [k]: v });
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <Zap className="size-5 text-orange" aria-hidden />
        <h3>Automação de vendas no direct</h3>
        <Badge tom="neutro" className="ml-auto">via Chatfyre</Badge>
        <Toggle ligado={ligado} rotulo="Criar automação para este post" onChange={(v) => editavel && onLigado(v)} />
      </div>
      <p className="mt-2 text-foot text-label2">
        Criada depois de publicar, ligada ao <b>media_id</b> do post. Nasce <b>pausada</b>: você ativa na tela Automações.
      </p>
      {ligado && (
        <fieldset disabled={!editavel} className="mt-4 grid gap-3 sm:grid-cols-[150px_1fr] sm:items-center">
          <label htmlFor="a-palavra" className="text-foot text-label2">Palavra-chave</label>
          <input id="a-palavra" className="campo" value={auto.palavra} maxLength={30} onChange={(e) => campo("palavra", e.target.value.toUpperCase())} />
          <label htmlFor="a-resp" className="text-foot text-label2">Resposta pública</label>
          <input id="a-resp" className="campo" value={auto.resposta_publica} maxLength={200} onChange={(e) => campo("resposta_publica", e.target.value)} />
          <label htmlFor="a-dm" className="text-foot text-label2 sm:self-start sm:pt-3">DM de boas-vindas</label>
          <textarea id="a-dm" className="campo min-h-24" value={auto.dm} maxLength={1000} onChange={(e) => campo("dm", e.target.value)} />
          <label htmlFor="a-botao" className="text-foot text-label2">Botão</label>
          <input id="a-botao" className="campo" value={auto.botao} maxLength={20} onChange={(e) => campo("botao", e.target.value)} />
          <span className="text-foot text-label2">Só para quem segue</span>
          <span className="flex items-center gap-3">
            <Toggle ligado={auto.so_seguidores} rotulo="Só para quem segue" onChange={(v) => editavel && campo("so_seguidores", v)} />
            <small className="text-cap1 text-label2">convida a seguir e confere de novo</small>
          </span>
          <label htmlFor="a-link" className="text-foot text-label2">Link</label>
          <input id="a-link" className="campo" type="url" placeholder="https://… (com utm_campaign)" value={auto.link} maxLength={500} onChange={(e) => campo("link", e.target.value)} />
          <label htmlFor="a-tlink" className="text-foot text-label2">Mensagem do link</label>
          <input id="a-tlink" className="campo" value={auto.texto_link} maxLength={1000} onChange={(e) => campo("texto_link", e.target.value)} />
          <label htmlFor="a-blink" className="text-foot text-label2">Botão do link</label>
          <input id="a-blink" className="campo" value={auto.botao_link} maxLength={20} onChange={(e) => campo("botao_link", e.target.value)} />
          <label htmlFor="a-lembrete" className="text-foot text-label2">Lembrete</label>
          <span className="flex items-center gap-2 text-foot">
            após
            <input id="a-lembrete" className="campo w-24" type="number" min={0} max={1440} value={auto.lembrete_min}
              onChange={(e) => campo("lembrete_min", Math.max(0, Math.min(1440, Number(e.target.value) || 0)))} />
            min do link (0 = sem lembrete)
          </span>
          {auto.lembrete_min > 0 && (
            <>
              <label htmlFor="a-tlemb" className="text-foot text-label2">Texto do lembrete</label>
              <input id="a-tlemb" className="campo" value={auto.texto_lembrete} maxLength={1000} onChange={(e) => campo("texto_lembrete", e.target.value)} />
            </>
          )}
        </fieldset>
      )}
      {ligado && (
        <p className="mt-4 flex flex-wrap items-center gap-2 text-cap1 text-label2">
          <span className="rounded-full bg-fill3 px-2.5 py-1">💬 Comentou "{auto.palavra || "?"}"</span>→
          <span className="rounded-full bg-fill3 px-2.5 py-1">DM + botão</span>→
          <span className="rounded-full bg-fill3 px-2.5 py-1">{auto.so_seguidores ? "Segue? sim → link" : "Link"}</span>
          {auto.lembrete_min > 0 && <>→<span className="rounded-full bg-fill3 px-2.5 py-1">Lembrete {auto.lembrete_min} min</span></>}
        </p>
      )}
    </Card>
  );
}
