import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, LoaderCircle, Plus, Radar as IconeRadar, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge, Card, Segmentado } from "@/components/ui/hig";
import { useAcesso } from "@/features/auth/acesso";
import { Nota } from "@/features/criar/comum";
import { chamarFuncao } from "@/features/criar/dados";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Hashtag = { id: string; hashtag: string; ativa: boolean; ultima_busca: string | null; ultimo_erro: string | null };
type Status = "nova" | "em_contato" | "descartada";
type Oportunidade = {
  id: string; hashtag: string; permalink: string | null; legenda: string | null; publicado_em: string | null;
  curtidas: number | null; comentarios: number | null; relevante: boolean | null; dor: string | null;
  produto_sugerido: string | null; comentario_sugerido: string | null; status: Status; contato_em: string | null; criado_em: string;
};
type Indicado = { id: string; legenda: string | null; formato: string; permalink: string | null; capa_url: string | null };

const MAX_ATIVAS = 30;
const MAX_DIA = 20;
const INTERVALO_MS = 3 * 60_000;
const ABAS: { valor: Status; rotulo: string }[] = [
  { valor: "nova", rotulo: "Novas" }, { valor: "em_contato", rotulo: "Em contato" }, { valor: "descartada", rotulo: "Descartadas" },
];

/** "#Corretor De Imóveis" → "corretordeimóveis" (o formato aceito pela migration). */
const normalizar = (s: string) => s.trim().replace(/^#+/, "").toLowerCase().replace(/\s+/g, "");
const hashtagValida = (s: string) => /^[a-z0-9_à-ÿ]{2,60}$/.test(s);
const relogio = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const inicioDoDia = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

/**
 * Radar de prospecção (Fase 9): a busca oficial por hashtag acha posts do nicho, a IA lê a legenda e sugere o comentário,
 * e o membro publica à mão. Nada é enviado sozinho. Limite de ritmo humano conferido no banco (radar_contato).
 */
export function Radar() {
  const { conta, demo } = useAcesso();
  const contaId = conta?.conta_id;
  const cliente = useQueryClient();
  const [aba, setAba] = useState<Status>("nova");
  const [sel, setSel] = useState<string | null>(null);
  const [nova, setNova] = useState("");
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const hashtags = useQuery({
    queryKey: ["radar-hashtags", contaId],
    enabled: !!contaId && !demo,
    queryFn: async () => {
      const { data, error } = await supabase.from("radar_hashtags").select("id, hashtag, ativa, ultima_busca, ultimo_erro")
        .eq("conta_id", contaId!).order("criado_em");
      if (error) throw error;
      return data as Hashtag[];
    },
  });

  const oportunidades = useQuery({
    queryKey: ["radar-oportunidades", contaId],
    enabled: !!contaId && !demo,
    queryFn: async () => {
      const { data, error } = await supabase.from("radar_oportunidades")
        .select("id, hashtag, permalink, legenda, publicado_em, curtidas, comentarios, relevante, dor, produto_sugerido, comentario_sugerido, status, contato_em, criado_em")
        .eq("conta_id", contaId!).order("criado_em", { ascending: false }).limit(400);
      if (error) throw error;
      return data as Oportunidade[];
    },
  });

  const lista = useMemo(() => oportunidades.data ?? [], [oportunidades.data]);
  const daAba = lista.filter((o) => o.status === aba)
    .sort((a, b) => aba === "em_contato" ? (b.contato_em ?? "").localeCompare(a.contato_em ?? "") : Number(a.relevante === null) - Number(b.relevante === null));
  const conta_ = (s: Status) => lista.filter((o) => o.status === s).length;
  const pendentes = lista.filter((o) => o.status === "nova" && o.relevante === null).length;
  const atual = lista.find((o) => o.id === sel) ?? null;
  const ativas = (hashtags.data ?? []).filter((h) => h.ativa).length;
  const erros = (hashtags.data ?? []).filter((h) => h.ativa && h.ultimo_erro);

  const contatosHoje = lista.filter((o) => o.contato_em && new Date(o.contato_em).getTime() >= inicioDoDia());
  const ultimo = Math.max(0, ...contatosHoje.map((o) => new Date(o.contato_em!).getTime()));
  const espera = Math.max(0, ultimo + INTERVALO_MS - agora);

  const indicado = useQuery({
    queryKey: ["radar-indicado", contaId, atual?.produto_sugerido],
    enabled: !!contaId && !!atual?.produto_sugerido,
    queryFn: async () => {
      const { data } = await supabase.from("posts").select("id, legenda, formato, permalink, capa_url")
        .eq("conta_id", contaId!).eq("status", "publicado").eq("produto", atual!.produto_sugerido!)
        .order("publicado_em", { ascending: false }).limit(1).maybeSingle();
      return (data as Indicado | null) ?? null;
    },
  });

  const recarregar = () => Promise.all(["radar-hashtags", "radar-oportunidades"].map((k) => cliente.invalidateQueries({ queryKey: [k] })));

  const incluir = useMutation({
    mutationFn: async () => {
      const h = normalizar(nova);
      if (!hashtagValida(h)) throw new Error("Hashtag inválida: só letras, números e _, de 2 a 60 caracteres.");
      const { error } = await supabase.from("radar_hashtags").insert({ conta_id: contaId, hashtag: h });
      if (error) throw new Error(error.code === "23505" ? "Essa hashtag já está na lista." : error.message);
    },
    onMutate: () => setAviso(null),
    onSuccess: () => setNova(""),
    onError: (e) => setAviso({ tom: "erro", texto: e.message }),
    onSettled: recarregar,
  });

  const alternar = useMutation({
    mutationFn: async (h: Hashtag) => {
      const { error } = await supabase.from("radar_hashtags").update({ ativa: !h.ativa }).eq("id", h.id);
      if (error) throw new Error(error.message);
    },
    onError: (e) => setAviso({ tom: "erro", texto: e.message }),
    onSettled: recarregar,
  });

  const remover = useMutation({
    mutationFn: async (h: Hashtag) => {
      const { error } = await supabase.from("radar_hashtags").delete().eq("id", h.id);
      if (error) throw new Error(error.message);
    },
    onSettled: recarregar,
  });

  /** A IA lê em lotes de 15; repete até acabar (no máximo 6 lotes por clique). */
  async function lerComIa() {
    let total = 0;
    for (let i = 0; i < 6; i++) {
      const r = await chamarFuncao<{ classificadas: number; restantes: number }>("ia-texto", { acao: "radar", conta_id: contaId });
      total += r.classificadas;
      await recarregar();
      if (!r.restantes || !r.classificadas) break;
    }
    return total;
  }

  const buscar = useMutation({
    mutationFn: async () => {
      const r = await chamarFuncao<{ novas?: number; erro?: string; resultados?: { hashtag: string; novas?: number; erro?: string }[] }>(
        "ig-hashtag", { conta_id: contaId },
      );
      await recarregar();
      const falhas = (r.resultados ?? []).filter((x) => x.erro).length;
      const lidas = r.novas ? await lerComIa() : 0;
      return { novas: r.novas ?? 0, falhas, lidas };
    },
    onMutate: () => setAviso(null),
    onSuccess: (r) => setAviso({
      tom: r.falhas && !r.novas ? "erro" : "ok",
      texto: `${r.novas} ${r.novas === 1 ? "post novo" : "posts novos"}${r.lidas ? `, ${r.lidas} lidos pela IA` : ""}.${r.falhas ? ` ${r.falhas} hashtag(s) com erro: veja abaixo.` : ""}`,
    }),
    onError: (e) => setAviso({ tom: "erro", texto: e.message }),
  });

  const classificar = useMutation({
    mutationFn: lerComIa,
    onMutate: () => setAviso(null),
    onSuccess: (n) => setAviso({ tom: "ok", texto: `${n} ${n === 1 ? "post lido" : "posts lidos"} pela IA.` }),
    onError: (e) => setAviso({ tom: "erro", texto: e.message }),
  });

  const mudarStatus = useMutation({
    mutationFn: async (p: { id: string; status: "nova" | "descartada" }) => {
      const { error } = await supabase.from("radar_oportunidades").update({ status: p.status }).eq("id", p.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => setSel(null),
    onSettled: recarregar,
  });

  const salvarComentario = useMutation({
    mutationFn: async (p: { id: string; texto: string }) => {
      const { error } = await supabase.from("radar_oportunidades").update({ comentario_sugerido: p.texto.slice(0, 600) }).eq("id", p.id);
      if (error) throw new Error(error.message);
    },
    onSettled: recarregar,
  });

  /** Copia o comentário e abre o post. A janela abre no clique (sem bloqueio de pop-up) e só vai ao post se o banco aceitar. */
  async function copiarEAbrir(o: Oportunidade, texto: string) {
    setAviso(null);
    if (contatosHoje.length >= MAX_DIA) return setAviso({ tom: "erro", texto: "Limite de 20 comentários por dia atingido. Volte amanhã." });
    if (espera > 0) return setAviso({ tom: "erro", texto: `Espere ${Math.ceil(espera / 1000)} s para o próximo (ritmo de pessoa, não de robô).` });
    const janela = window.open("", "_blank");
    try {
      await navigator.clipboard.writeText(texto).catch(() => undefined);
      const { error } = await supabase.rpc("radar_contato", { p_id: o.id });
      if (error) throw new Error(error.message);
      if (janela) {
        janela.opener = null;
        janela.location.href = o.permalink!;
      }
      setAviso({ tom: "ok", texto: "Comentário copiado. Cole no post, revise e publique. A oportunidade foi para \"Em contato\"." });
      setSel(null);
      await recarregar();
    } catch (e) {
      janela?.close();
      setAviso({ tom: "erro", texto: (e as Error).message });
    }
  }

  return (
    <section className="pagina-entra">
      <PageHeader
        titulo="Radar de prospecção"
        subtitulo="Encontre posts do seu nicho, entre na conversa e leve a pessoa para o seu conteúdo"
        icone={IconeRadar}
        cor="green"
        acoes={
          <div className="flex flex-wrap gap-2">
            {pendentes > 0 && (
              <Button variante="secundario" onClick={() => classificar.mutate()} disabled={classificar.isPending || buscar.isPending}>
                {classificar.isPending ? <LoaderCircle className="animate-spin" /> : <Sparkles />} Ler com IA ({pendentes})
              </Button>
            )}
            <Button onClick={() => buscar.mutate()} disabled={demo || !contaId || !ativas || buscar.isPending || classificar.isPending}>
              {buscar.isPending ? <LoaderCircle className="animate-spin" /> : <IconeRadar />} {buscar.isPending ? "Buscando…" : "Buscar agora"}
            </Button>
          </div>
        }
      />
      {demo && <Nota className="mb-5">Modo demonstração: o radar não é carregado.</Nota>}
      {(hashtags.error || oportunidades.error) && (
        <Nota className="mb-5">Não foi possível ler o radar ({(hashtags.error ?? oportunidades.error as { message?: string })?.message}). Se for a primeira vez, rode a migration <code>20261028010000_fase9_radar.sql</code> no SQL Editor.</Nota>
      )}
      {aviso && <p role={aviso.tom === "erro" ? "alert" : "status"} className={cn("mb-4 text-foot", aviso.tom === "erro" ? "text-red" : "text-green")}>{aviso.texto}</p>}

      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <b>Hashtags monitoradas</b>
          <span className="ml-auto text-foot text-label2">{ativas} de {MAX_ATIVAS} por semana · API oficial do Instagram · busca toda segunda · R$ 0</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(hashtags.data ?? []).map((h) => (
            <span key={h.id} className={cn("inline-flex items-center rounded-full text-foot", h.ativa ? "bg-green/15 text-label" : "bg-fill3 text-label2", h.ultimo_erro && h.ativa && "ring-1 ring-red")}>
              <button type="button" onClick={() => alternar.mutate(h)} aria-pressed={h.ativa} title={h.ultimo_erro ?? (h.ativa ? "Ativa: clique para pausar" : "Pausada: clique para ativar")} className="py-1.5 pr-1 pl-3">
                #{h.hashtag}
              </button>
              <button type="button" onClick={() => remover.mutate(h)} aria-label={`Remover #${h.hashtag}`} className="grid size-7 place-items-center rounded-full text-label2 hover:text-red"><X className="size-3.5" /></button>
            </span>
          ))}
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (nova.trim()) incluir.mutate(); }}>
            <input className="campo min-h-9 w-52 py-1 text-foot" placeholder="#corretordeimoveis" aria-label="Nova hashtag" value={nova}
              onChange={(e) => setNova(e.target.value)} disabled={demo || ativas >= MAX_ATIVAS} />
            <Button type="submit" tamanho="sm" variante="secundario" disabled={demo || !nova.trim() || incluir.isPending}><Plus /> Adicionar</Button>
          </form>
        </div>
        {erros.length > 0 && (
          <ul className="mt-3 grid gap-1 text-cap1 text-red">
            {erros.map((h) => <li key={h.id}><b>#{h.hashtag}:</b> {h.ultimo_erro}</li>)}
          </ul>
        )}
        <p className="mt-3 text-cap1 text-label2">Clique na hashtag para pausar ou ativar. A Meta conta 30 hashtags diferentes a cada 7 dias: trocar muito gasta o limite.</p>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <h2>Oportunidades encontradas</h2>
            <Segmentado className="ml-auto" rotulo="Situação" valor={aba} onChange={(v) => { setAba(v); setSel(null); }}
              opcoes={ABAS.map((a) => ({ valor: a.valor, rotulo: `${a.rotulo} ${conta_(a.valor)}` }))} />
          </div>
          {oportunidades.isLoading ? (
            <div className="mt-4 grid gap-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-hig-lg bg-bg3" />)}</div>
          ) : !daAba.length ? (
            <p className="mt-4 rounded-hig-lg border border-dashed border-sep py-8 text-center text-foot text-label2">
              {aba === "nova" ? (ativas ? "Nada novo. Clique em \"Buscar agora\" ou espere a busca de segunda." : "Adicione hashtags do seu nicho para começar.") : "Nada aqui."}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-sep">
              {daAba.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => setSel(o.id)} aria-pressed={o.id === sel}
                    className={cn("grid w-full gap-1 rounded-hig-lg px-3 py-3 text-left hover:bg-fill3 sm:grid-cols-[1fr_auto]", o.id === sel && "bg-fill3 ring-2 ring-blue")}>
                    <span className="min-w-0">
                      <b className="text-foot">#{o.hashtag}</b>
                      <small className="block truncate text-cap1 text-label2">{o.legenda ? `"${o.legenda.slice(0, 160)}"` : "legenda apagada (30 dias)"}</small>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 sm:justify-end">
                      {o.relevante === null ? <Badge>aguardando IA</Badge> : o.dor && <Badge tom="aviso">{o.dor}</Badge>}
                      {o.produto_sugerido && <span className="text-cap1 text-label2">{o.produto_sugerido}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-cap1 text-label2">
            A IA (Gemini) lê só a legenda e classifica a dor. A API de hashtag não informa quem postou: o botão abre o post no Instagram.
            Oportunidades somem em 30 dias; das que viraram contato fica só o link.
          </p>
        </Card>

        <div className="grid gap-5">
          {atual ? <Abordagem key={atual.id} o={atual} indicado={indicado.data ?? null} espera={espera} limite={contatosHoje.length >= MAX_DIA}
            onCopiar={copiarEAbrir} onStatus={(s) => mudarStatus.mutate({ id: atual.id, status: s })}
            onSalvar={(t) => salvarComentario.mutate({ id: atual.id, texto: t })} /> : (
            <Card><p className="text-foot text-label2">Escolha uma oportunidade para ver o comentário sugerido.</p></Card>
          )}
          <Nota>
            <span><b>Por que não manda DM sozinho:</b> a Meta só permite DM automático para quem falou com você primeiro. DM em massa para
                desconhecidos é proibido e derruba a conta. O radar acha a oportunidade, a IA escreve o comentário e <b>você publica</b>. Quem
                responde ou comenta "QUERO" entra no funil do Chatfyre.</span>
          </Nota>
          <Card>
            <b>Limite de segurança</b>
            <p className="mt-1 text-foot text-label2">Máx. {MAX_DIA} comentários manuais por dia, intervalo mínimo de 3 min. Ritmo de pessoa, não de robô.</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-fill3">
              <i className={cn("block h-full", contatosHoje.length >= MAX_DIA ? "bg-red" : "bg-green")} style={{ width: `${Math.min(100, (contatosHoje.length / MAX_DIA) * 100)}%` }} />
            </div>
            <small className="mt-1 block text-cap1 text-label2 tabular-nums">
              {contatosHoje.length} de {MAX_DIA} hoje{espera > 0 && ` · próximo em ${relogio(espera)}`}
            </small>
          </Card>
        </div>
      </div>
    </section>
  );
}

function Abordagem({ o, indicado, espera, limite, onCopiar, onStatus, onSalvar }: {
  o: Oportunidade; indicado: Indicado | null; espera: number; limite: boolean;
  onCopiar: (o: Oportunidade, texto: string) => void; onStatus: (s: "nova" | "descartada") => void; onSalvar: (texto: string) => void;
}) {
  const [texto, setTexto] = useState(o.comentario_sugerido ?? "");
  const editavel = o.status !== "em_contato";
  return (
    <Card>
      <b>Abordagem sugerida · #{o.hashtag}</b>
      {o.legenda && <p className="mt-3 max-h-32 overflow-auto rounded-hig-lg bg-fill3 p-3 text-cap1 whitespace-pre-line text-label2">{o.legenda}</p>}

      <div className="mt-4 mb-2 text-foot text-label2">1. Comentário (você revisa e publica)</div>
      {o.relevante === null ? (
        <p className="text-foot text-label2">A IA ainda não leu este post. Use "Ler com IA".</p>
      ) : (
        <textarea className="campo min-h-24" maxLength={600} value={texto} disabled={!editavel} placeholder="Escreva o comentário"
          onChange={(e) => setTexto(e.target.value)} onBlur={() => editavel && texto !== (o.comentario_sugerido ?? "") && onSalvar(texto)} />
      )}

      <div className="mt-4 mb-2 text-foot text-label2">2. Conteúdo para indicar</div>
      {indicado ? (
        <a href={indicado.permalink ?? undefined} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-hig-lg bg-fill3 p-2.5 hover:ring-2 ring-blue">
          {indicado.capa_url ? <img src={indicado.capa_url} alt="" className="h-15 w-12 flex-none rounded-md object-cover" /> : <span className="h-15 w-12 flex-none rounded-md bg-blue" />}
          <span className="min-w-0"><b className="line-clamp-1 text-foot">{(indicado.legenda ?? "Post").split("\n")[0]}</b>
            <small className="text-cap1 text-label2">{indicado.formato} · {o.produto_sugerido}</small></span>
        </a>
      ) : (
        <p className="text-cap1 text-label2">
          {o.produto_sugerido ? <>Nenhum post publicado sobre "{o.produto_sugerido}" ainda. <Link to="/criar" className="text-blue">Criar um</Link>.</> : "Sem produto sugerido."}
        </p>
      )}

      <div className="mt-4 mb-2 text-foot text-label2">3. Se a pessoa responder → DM</div>
      <p className="text-cap1 text-label2">Quem responde ou comenta "QUERO" entra na automação do Chatfyre, aí sim com DM, botão e link.</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {o.status === "em_contato" ? (
          <>
            <a href={o.permalink ?? undefined} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-fill2 px-5 font-semibold text-blue"><ExternalLink className="size-[18px]" /> Abrir post</a>
            <p className="self-center text-cap1 text-label2">Contato em {new Date(o.contato_em!).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
          </>
        ) : (
          <>
            <Button variante="sucesso" onClick={() => onCopiar(o, texto)} disabled={!o.permalink || !texto.trim() || limite || espera > 0}>
              <Copy /> Copiar e abrir post
            </Button>
            {o.status === "nova"
              ? <Button variante="secundario" onClick={() => onStatus("descartada")}><Trash2 /> Descartar</Button>
              : <Button variante="secundario" onClick={() => onStatus("nova")}><RotateCcw /> Recuperar</Button>}
          </>
        )}
      </div>
    </Card>
  );
}
