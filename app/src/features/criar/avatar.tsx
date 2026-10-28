import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Clapperboard, FolderOpen, LoaderCircle, Sparkles, UserRound } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, botao } from "@/components/ui/button";
import { Card, Segmentado } from "@/components/ui/hig";
import { useAcesso } from "@/features/auth/acesso";
import { useAvatares } from "@/features/avatares/avatares";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Nota } from "./comum";
import { chamarFuncao, ErroFuncao } from "./dados";
import { PRODUTOS } from "./esquema";

type Segundos = "30" | "45" | "60" | "90";
type Roteiro = {
  id: string; avatar_id: string | null; titulo: string; produto: string | null; texto: string; legenda: string | null;
  status: "rascunho" | "gerando" | "pronto" | "erro"; midia_id: string | null; post_id: string | null; custo_usd: number | null; erro: string | null;
  midias: { storage_path: string } | null; drive_url: string | null;
};
type Uso = { gasto_usd: number; teto_usd: number };

// Mesmo cálculo da Edge Function ia-avatar: ~150 palavras por minuto, US$ 1 por minuto (estimativa).
const USD_POR_MINUTO = 1;
const minutos = (texto: string) => Math.max(0.25, (texto.trim().split(/\s+/).filter(Boolean).length || 0) / 150);
const usd = (v: number) => `US$ ${v.toFixed(2)}`;
const CAMPOS = "id, avatar_id, titulo, produto, texto, legenda, status, midia_id, post_id, custo_usd, erro, midias(storage_path), drive_url";

/** Vídeo narrado com avatar (Fase 7.2): roteiro (Gemini) → avatar e voz → HeyGen → Reels. ?roteiro=<id> retoma. */
export function VideoAvatar() {
  const [busca] = useSearchParams();
  const id = busca.get("roteiro");
  const { conta, demo } = useAcesso();
  const roteiro = useQuery({
    queryKey: ["roteiro", id],
    enabled: !!id && !demo,
    queryFn: async () => {
      const { data, error } = await supabase.from("roteiros").select(CAMPOS).eq("id", id!).single();
      if (error) throw error;
      return data as unknown as Roteiro;
    },
    // Enquanto a HeyGen gera, confere a cada 10 s (a Edge Function baixa o vídeo quando fica pronto).
    refetchInterval: (q) => (q.state.data?.status === "gerando" ? 10_000 : false),
  });
  if (id && roteiro.isLoading) {
    return <div className="grid h-[60vh] place-items-center text-label2"><LoaderCircle className="size-6 animate-spin" aria-label="Carregando" /></div>;
  }
  return <Wizard key={roteiro.data?.id ?? "novo"} inicial={roteiro.data ?? null} contaId={conta?.conta_id} demo={demo} />;
}

function Wizard({ inicial, contaId, demo }: { inicial: Roteiro | null; contaId?: string; demo: boolean }) {
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const avatares = useAvatares();
  const ativos = (avatares.data ?? []).filter((a) => a.ativo);

  const [tema, setTema] = useState("");
  const [produto, setProduto] = useState<string>(inicial?.produto ?? PRODUTOS[0]);
  const [segundos, setSegundos] = useState<Segundos>("45");
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [texto, setTexto] = useState(inicial?.texto ?? "");
  const [legenda, setLegenda] = useState(inicial?.legenda ?? "");
  const [avatarId, setAvatarId] = useState<string | null>(inicial?.avatar_id ?? null);
  const [confirmar, setConfirmar] = useState<number | null>(null);
  const editavel = !inicial || inicial.status === "rascunho" || inicial.status === "erro";
  const avatar = ativos.find((a) => a.id === avatarId) ?? null;
  const estimativa = minutos(texto) * USD_POR_MINUTO;

  const uso = useQuery({
    queryKey: ["uso-ia", contaId],
    enabled: !!contaId && !demo,
    queryFn: () => chamarFuncao<Uso>("ia-imagem", { acao: "uso", conta_id: contaId }),
  });

  const escrever = useMutation({
    mutationFn: () => chamarFuncao<{ titulo: string; texto: string; legenda: string; hashtags: string[] }>("ia-texto", {
      acao: "roteiro", conta_id: contaId, tema, produto, segundos: Number(segundos),
    }),
    onSuccess: (r) => {
      setTitulo(r.titulo);
      setTexto(r.texto);
      setLegenda([r.legenda.trim(), r.hashtags.join(" ")].filter(Boolean).join("\n\n").slice(0, 2200));
    },
  });

  /** Grava o roteiro (cria ou atualiza). Gerando ou pronto, o roteiro não muda mais: só devolve o id. */
  async function salvar() {
    if (inicial && !editavel) return inicial.id;
    const campos = { titulo: titulo.trim(), produto, texto: texto.trim(), legenda: legenda.trim() || null, avatar_id: avatarId };
    if (inicial) {
      const { error } = await supabase.from("roteiros").update(campos).eq("id", inicial.id);
      if (error) throw new Error(error.message);
      return inicial.id;
    }
    const { data, error } = await supabase.from("roteiros").insert({ ...campos, conta_id: contaId }).select("id").single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  /** Grava o roteiro e manda gerar. */
  const gerar = useMutation({
    mutationFn: async (confirmado: boolean) => {
      const rid = await salvar();
      try {
        await chamarFuncao("ia-avatar", { acao: "gerar", conta_id: contaId, roteiro_id: rid, confirmar: confirmado });
      } finally {
        if (!inicial) navegar(`/criar/avatar?roteiro=${rid}`, { replace: true });
      }
      return rid;
    },
    onMutate: () => setConfirmar(null),
    onError: (e) => {
      if (e instanceof ErroFuncao && e.dados?.precisa_confirmar) setConfirmar(Number(e.dados.custo_estimado_usd) || estimativa);
    },
    onSettled: () => Promise.all(["roteiro", "uso-ia", "roteiros-recentes"].map((k) => cliente.invalidateQueries({ queryKey: [k] }))),
  });

  // Enquanto gera, quem baixa o vídeo pronto é a ação "status" (a página recarrega o roteiro a cada 10 s).
  useQuery({
    queryKey: ["roteiro-status", inicial?.id, inicial?.status],
    enabled: inicial?.status === "gerando" && !!contaId,
    refetchInterval: 10_000,
    queryFn: async () => {
      const r = await chamarFuncao<{ status: string }>("ia-avatar", { acao: "status", conta_id: contaId, roteiro_id: inicial!.id });
      if (r.status !== "gerando") await cliente.invalidateQueries({ queryKey: ["roteiro"] });
      return r;
    },
  });

  const video = useQuery({
    queryKey: ["video-url", inicial?.midias?.storage_path],
    enabled: !!inicial?.midias?.storage_path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("imobinsta-midias").createSignedUrl(inicial!.midias!.storage_path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  /** Fase 11: pasta no Drive com roteiro, legenda e imagens, para montar no Google Vids (grátis). */
  const vids = useMutation({
    mutationFn: async () => {
      const rid = await salvar();
      try {
        return await chamarFuncao<{ url: string; criada: boolean; faltaram?: string[] }>("google-drive", { acao: "vids", conta_id: contaId, roteiro_id: rid });
      } finally {
        if (!inicial) navegar(`/criar/avatar?roteiro=${rid}`, { replace: true });
      }
    },
    onSettled: () => Promise.all(["roteiro", "roteiros-recentes"].map((k) => cliente.invalidateQueries({ queryKey: [k] }))),
  });
  const pastaDrive = vids.data?.url ?? inicial?.drive_url;

  const criarReels = useMutation({
    mutationFn: async () => {
      if (inicial!.post_id) return inicial!.post_id;
      const { data, error } = await supabase.from("posts").insert({
        conta_id: contaId, formato: "reels", status: "rascunho", objetivo: "vender", produto, origem: "zero",
        prompt: inicial!.texto, legenda: legenda.trim() || inicial!.legenda || "", criar_automacao: true, video_midia_id: inicial!.midia_id,
        pasta: produto,
      }).select("id").single();
      if (error) throw new Error(error.message);
      await supabase.from("roteiros").update({ post_id: data.id }).eq("id", inicial!.id);
      return data.id as string;
    },
    onSuccess: (pid) => navegar(`/criar/publicar/${pid}`),
  });

  const erroGerar = gerar.error && !(gerar.error instanceof ErroFuncao && gerar.error.dados?.precisa_confirmar) ? gerar.error.message : null;
  const pct = uso.data ? Math.min(100, (uso.data.gasto_usd / Math.max(uso.data.teto_usd, 0.01)) * 100) : 0;
  const pode = editavel && !!avatar && titulo.trim().length > 0 && texto.trim().length >= 20 && !demo;

  return (
    <section className="pagina-entra">
      <PageHeader titulo="Vídeo narrado com avatar" subtitulo="O avatar fala o roteiro com a voz clonada; o vídeo vira Reels" icone={Clapperboard} cor="purple" />
      {demo && <Nota className="mb-5">Modo demonstração: gerar vídeo fica desligado.</Nota>}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_minmax(300px,380px)]">
        <div className="grid gap-5">
          <Card>
            <b>1. Roteiro</b>
            <fieldset disabled={!editavel} className="mt-3 grid gap-3">
              <label htmlFor="av-tema" className="text-foot text-label2">Sobre o que o vídeo fala?</label>
              <textarea id="av-tema" className="campo min-h-20" maxLength={1500} value={tema} onChange={(e) => setTema(e.target.value)}
                placeholder="Ex.: por que a equipe ainda vive de planilha mesmo com o ERP cheio de dados" />
              <div className="flex flex-wrap items-center gap-3">
                <select aria-label="Produto" className="campo max-w-64" value={produto} onChange={(e) => setProduto(e.target.value)}>
                  {PRODUTOS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <Segmentado rotulo="Duração" valor={segundos} onChange={setSegundos}
                  opcoes={[{ valor: "30", rotulo: "30 s" }, { valor: "45", rotulo: "45 s" }, { valor: "60", rotulo: "60 s" }, { valor: "90", rotulo: "90 s" }]} />
                <Button variante="secundario" tamanho="sm" onClick={() => escrever.mutate()} disabled={tema.trim().length < 10 || escrever.isPending || demo}>
                  {escrever.isPending ? <LoaderCircle className="animate-spin" /> : <Sparkles />} Escrever com IA
                </Button>
              </div>
              {escrever.error && <p role="alert" className="text-foot text-red">{escrever.error.message}</p>}
              <label htmlFor="av-titulo" className="mt-2 text-foot text-label2">Título (interno)</label>
              <input id="av-titulo" className="campo" maxLength={160} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
              <label htmlFor="av-texto" className="text-foot text-label2">O que o avatar fala</label>
              <textarea id="av-texto" className="campo min-h-48 leading-normal" maxLength={3000} value={texto} onChange={(e) => setTexto(e.target.value)} />
              <span className="text-cap1 text-label2">
                {texto.trim().split(/\s+/).filter(Boolean).length} palavras · cerca de {Math.round(minutos(texto) * 60)} s de vídeo
              </span>
              <label htmlFor="av-legenda" className="text-foot text-label2">Legenda do Reels</label>
              <textarea id="av-legenda" className="campo min-h-28" maxLength={2200} value={legenda} onChange={(e) => setLegenda(e.target.value)} />
            </fieldset>
          </Card>

          <Card>
            <b>2. Avatar e voz</b>
            {avatares.isLoading && <p className="mt-3 text-foot text-label2">Carregando…</p>}
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {ativos.map((a) => (
                <button key={a.id} type="button" disabled={!editavel} onClick={() => setAvatarId(a.id)}
                  className={cn("rounded-hig-lg bg-fill3 p-4 text-center transition-shadow", avatarId === a.id && "ring-2 ring-blue")}>
                  {a.preview_url
                    ? <img src={a.preview_url} alt="" className="mx-auto mb-2 size-20 rounded-full object-cover" />
                    : <span className="mx-auto mb-2 grid size-20 place-items-center rounded-full bg-gradient-to-br from-orange to-red"><UserRound className="size-8 text-white" /></span>}
                  <b className="text-foot">{a.nome}</b>
                </button>
              ))}
              <Link to="/avatares" className="grid place-items-center rounded-hig-lg border border-dashed border-sep p-4 text-center text-foot text-label2 hover:text-blue">
                + Cadastrar avatar
              </Link>
            </div>
          </Card>
        </div>

        <div className="grid gap-4 lg:sticky lg:top-6">
          <Card className="text-center">
            {inicial?.status === "pronto" && video.data ? (
              <video src={video.data} controls playsInline className="mx-auto aspect-[9/16] w-full max-w-[260px] rounded-hig-xl bg-black" />
            ) : (
              <div className="mx-auto grid aspect-[9/16] w-full max-w-[260px] place-items-center rounded-hig-xl bg-gradient-to-b from-[#1f2937] to-[#0f172a] p-4 text-foot text-label2">
                {inicial?.status === "gerando"
                  ? <span className="grid justify-items-center gap-2"><LoaderCircle className="size-7 animate-spin" /> A HeyGen está gerando o vídeo. Costuma levar alguns minutos; pode sair desta tela.</span>
                  : "O vídeo aparece aqui quando ficar pronto."}
              </div>
            )}
            {inicial?.status === "erro" && <p role="alert" className="mt-3 text-foot text-red">{inicial.erro}</p>}
            {inicial?.status === "pronto" && inicial.custo_usd != null && <p className="mt-3 text-cap1 text-label2">Custo: {usd(Number(inicial.custo_usd))} · guardado no Banco de mídias (pasta Avatar)</p>}
          </Card>

          <Card>
            <div className="flex items-center"><span className="text-foot text-label2">Custo estimado</span><b className="ml-auto text-orange">~ {usd(estimativa)}</b></div>
            <div className="mt-2 flex items-center"><span className="text-foot text-label2">Teto do mês</span>
              <b className="ml-auto text-foot">{uso.data ? `${usd(uso.data.gasto_usd)} de ${usd(uso.data.teto_usd)}` : "—"}</b></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-fill3"><div className="h-full rounded-full bg-purple" style={{ width: `${pct}%` }} /></div>

            {inicial?.status === "pronto" ? (
              <Button className="mt-4 w-full" onClick={() => criarReels.mutate()} disabled={criarReels.isPending}>
                {criarReels.isPending ? <LoaderCircle className="animate-spin" /> : <ArrowRight />} {inicial.post_id ? "Abrir o Reels" : "Criar Reels e publicar"}
              </Button>
            ) : confirmar != null ? (
              <div className="mt-4 rounded-hig-lg bg-fill3 p-3 text-left">
                <p className="text-foot">Este vídeo custa cerca de <b>{usd(confirmar)}</b>. Gerar mesmo assim?</p>
                <div className="mt-3 flex gap-2">
                  <Button tamanho="sm" onClick={() => gerar.mutate(true)} disabled={gerar.isPending}>Confirmar e gerar</Button>
                  <Button tamanho="sm" variante="secundario" onClick={() => setConfirmar(null)}>Cancelar</Button>
                </div>
              </div>
            ) : (
              <Button className="mt-4 w-full" onClick={() => gerar.mutate(false)} disabled={!pode || gerar.isPending || inicial?.status === "gerando"}>
                {gerar.isPending ? <LoaderCircle className="animate-spin" /> : <Clapperboard />} {inicial?.status === "erro" ? "Tentar de novo" : "Gerar vídeo"}
              </Button>
            )}
            {erroGerar && <p role="alert" className="mt-3 text-foot text-red">{erroGerar}</p>}
            {criarReels.error && <p role="alert" className="mt-3 text-foot text-red">{criarReels.error.message}</p>}
            {!avatar && editavel && <p className="mt-3 text-cap1 text-label2">Escolha um avatar para gerar.</p>}
            <p className="mt-3 text-cap1 text-label2">O vídeo pronto entra no Banco de mídias e segue para Publicar, com a automação "QUERO" do Chatfyre.</p>
          </Card>

          <Card>
            <div className="flex items-center gap-2"><FolderOpen className="size-4 text-blue" /><b className="text-foot">Ou monte no Google Vids · grátis</b></div>
            <p className="mt-2 text-cap1 text-label2">
              O estúdio cria uma pasta no seu Google Drive com o roteiro, a legenda, o logo e as imagens do produto. Você monta no Vids
              e exporta o MP4 para a subpasta <b>prontos</b>. Não precisa de avatar.
            </p>
            {pastaDrive ? (
              <div className="mt-3 grid gap-2">
                <a href={pastaDrive} target="_blank" rel="noreferrer" className={cn(botao({ tamanho: "sm" }), "w-full")}>Abrir a pasta no Drive</a>
                <a href="https://vids.google.com/" target="_blank" rel="noreferrer" className={cn(botao({ tamanho: "sm", variante: "secundario" }), "w-full")}>Abrir o Google Vids</a>
              </div>
            ) : (
              <Button tamanho="sm" variante="secundario" className="mt-3 w-full" onClick={() => vids.mutate()}
                disabled={demo || vids.isPending || titulo.trim().length === 0 || texto.trim().length < 20}>
                {vids.isPending ? <LoaderCircle className="animate-spin" /> : <FolderOpen />} {vids.isPending ? "Criando a pasta…" : "Preparar pasta no Drive"}
              </Button>
            )}
            {vids.data?.faltaram?.length ? <p className="mt-2 text-cap1 text-orange">Não subiram: {vids.data.faltaram.join(", ")}.</p> : null}
            {vids.error && (
              <p role="alert" className="mt-2 text-cap1 text-red">
                {vids.error.message} {vids.error instanceof ErroFuncao && vids.error.status === 409 && <Link to="/conexoes" className="underline">Abrir Conexões</Link>}
              </p>
            )}
          </Card>

          {!demo && <RoteirosRecentes contaId={contaId} atual={inicial?.id} />}
        </div>
      </div>
    </section>
  );
}

const STATUS_ROTEIRO: Record<Roteiro["status"], string> = { rascunho: "rascunho", gerando: "gerando…", pronto: "pronto", erro: "erro" };

function RoteirosRecentes({ contaId, atual }: { contaId?: string; atual?: string }) {
  const recentes = useQuery({
    queryKey: ["roteiros-recentes", contaId],
    enabled: !!contaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("roteiros").select("id, titulo, status").eq("conta_id", contaId!)
        .order("criado_em", { ascending: false }).limit(6);
      if (error) throw error;
      return data as { id: string; titulo: string; status: Roteiro["status"] }[];
    },
  });
  if (!recentes.data?.length) return null;
  return (
    <Card>
      <div className="flex items-center"><b className="text-foot">Roteiros recentes</b>
        <Link to="/criar/avatar" className="ml-auto text-cap1 text-blue">Novo</Link></div>
      <ul className="mt-2 grid gap-1">
        {recentes.data.map((r) => (
          <li key={r.id}>
            <Link to={`/criar/avatar?roteiro=${r.id}`} className={cn("flex gap-2 rounded-md px-2 py-1.5 text-foot hover:bg-fill3", r.id === atual && "bg-fill3")}>
              <span className="min-w-0 flex-1 truncate">{r.titulo}</span>
              <span className={cn("text-cap1", r.status === "pronto" ? "text-green" : r.status === "erro" ? "text-red" : "text-label2")}>{STATUS_ROTEIRO[r.status]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
