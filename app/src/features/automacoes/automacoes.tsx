import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, LoaderCircle, Pause, Play, Plus, RefreshCw, Zap } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, botao } from "@/components/ui/button";
import { Badge, Card, Segmentado } from "@/components/ui/hig";
import { useAcesso } from "@/features/auth/acesso";
import { chamarFuncao, type AutomacaoConfig } from "@/features/criar/dados";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Linha = {
  id: string; post_id: string | null; chatfyre_id: string | null; nome: string | null; palavra: string | null;
  status: "pausada" | "ativa" | "erro"; versao_fluxo: number | null; erro: string | null; criado_em: string;
  config_json: Partial<AutomacaoConfig> & { fluxo?: string };
  posts: { permalink: string | null; produto: string | null } | null;
};

/** Automação que existe no Chatfyre mas não foi criada pelo estúdio (ex.: a "QUERO" da Fase 0). */
type Externa = { id: string; nome: string; ativa: boolean | null; palavras: string[] };

type Dias = "7" | "14" | "30" | "0";
const PERIODOS: { valor: Dias; rotulo: string }[] = [
  { valor: "7", rotulo: "7 dias" }, { valor: "14", rotulo: "14 dias" }, { valor: "30", rotulo: "30 dias" }, { valor: "0", rotulo: "Sempre" },
];

const FLUXO_ROTULO: Record<string, string> = {
  linear: "simples", rascunho: "segue a conta · rascunho", pendente: "segue a conta · a montar", publicado: "segue a conta",
};

const texto = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** A resposta do listar_automacoes não é documentada: lê nome, status e palavras nos campos prováveis. */
function externasDe(r: unknown): Externa[] {
  const lista = Array.isArray(r) ? r : r && typeof r === "object" ? Object.values(r).find(Array.isArray) ?? [] : [];
  return (lista as Record<string, unknown>[])
    .map((a) => ({
      id: texto(a.id ?? a.automacao_id),
      nome: texto(a.name ?? a.nome) || "Sem nome",
      ativa: typeof (a.active ?? a.ativa) === "boolean" ? (a.active ?? a.ativa) as boolean : null,
      palavras: Array.isArray(a.keywords ?? a.palavras) ? ((a.keywords ?? a.palavras) as unknown[]).map(texto) : [],
    }))
    .filter((a) => a.id);
}

/** Procura o funil na resposta do metricas_do_fluxo: lista de etapas ou objeto etapa → número. */
function etapasDe(r: unknown): { rotulo: string; valor: number }[] {
  if (!r || typeof r !== "object") return [];
  const o = r as Record<string, unknown>;
  const f = o.funil ?? o.funnel;
  if (Array.isArray(f)) {
    return (f as Record<string, unknown>[]).flatMap((e) => {
      const rotulo = Object.values(e).find((v) => typeof v === "string") as string | undefined;
      const valor = Object.values(e).find((v) => typeof v === "number") as number | undefined;
      return rotulo && valor != null ? [{ rotulo, valor }] : [];
    });
  }
  if (f && typeof f === "object") {
    return Object.entries(f as Record<string, unknown>)
      .filter(([, v]) => typeof v === "number")
      .map(([k, v]) => ({ rotulo: k.replace(/_/g, " "), valor: v as number }));
  }
  return [];
}

function gargaloDe(r: unknown): string | null {
  if (!r || typeof r !== "object") return null;
  const g = (r as Record<string, unknown>).gargalo ?? (r as Record<string, unknown>).bottleneck;
  if (typeof g === "string") return g;
  if (g && typeof g === "object") return Object.values(g).filter((v) => typeof v === "string").join(" · ") || null;
  return null;
}

function StatusBadge({ status }: { status: Linha["status"] | "externa-ativa" | "externa-pausada" | "externa" }) {
  if (status === "ativa" || status === "externa-ativa") return <Badge tom="ok">Ativa</Badge>;
  if (status === "erro") return <Badge tom="aviso">Erro</Badge>;
  if (status === "externa") return <Badge>—</Badge>;
  return <Badge>Pausada</Badge>;
}

export function Automacoes() {
  const { conta, demo } = useAcesso();
  const contaId = conta?.conta_id;
  const dono = conta?.papel === "dono";
  const cliente = useQueryClient();
  const [dias, setDias] = useState<Dias>("7");
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);

  const locais = useQuery({
    queryKey: ["automacoes", contaId],
    enabled: !!contaId && !demo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automacoes")
        .select("id, post_id, chatfyre_id, nome, palavra, status, versao_fluxo, erro, criado_em, config_json, posts(permalink, produto)")
        .eq("conta_id", contaId!)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Linha[];
    },
  });

  const chatfyre = useQuery({
    queryKey: ["chatfyre-automacoes", contaId],
    enabled: !!contaId && !demo,
    retry: false,
    queryFn: async () =>
      externasDe((await chamarFuncao<{ resultado: unknown }>("chatfyre", { acao: "ler", conta_id: contaId, ferramenta: "listar_automacoes" })).resultado),
  });

  const doEstudio = new Set((locais.data ?? []).map((l) => l.chatfyre_id).filter(Boolean));
  const externas = (chatfyre.data ?? []).filter((a) => !doEstudio.has(a.id));
  const ativaNoChatfyre = new Map((chatfyre.data ?? []).map((a) => [a.id, a.ativa]));
  const selecionada = escolhida ?? locais.data?.find((l) => l.chatfyre_id)?.chatfyre_id ?? externas[0]?.id ?? null;

  const funil = useQuery({
    queryKey: ["funil", contaId, selecionada, dias],
    enabled: !!contaId && !!selecionada,
    retry: false,
    queryFn: async () =>
      (await chamarFuncao<{ resultado: unknown }>("chatfyre", {
        acao: "ler", conta_id: contaId, ferramenta: "metricas_do_fluxo", argumentos: { automacao_id: selecionada, dias: Number(dias) },
      })).resultado,
  });

  const atualizar = () => Promise.all(["automacoes", "chatfyre-automacoes", "funil"].map((k) => cliente.invalidateQueries({ queryKey: [k] })));

  const status = useMutation({
    mutationFn: ({ id, ativa }: { id: string; ativa: boolean }) =>
      chamarFuncao<{ status: string }>("chatfyre", { acao: "automacao_status", conta_id: contaId, automacao_id: id, ativa }),
    onMutate: () => setAviso(null),
    onSuccess: (r) => setAviso({ tom: "ok", texto: r.status === "ativa" ? "Automação ativa: já responde a quem comentar." : "Automação pausada." }),
    onError: (e) => setAviso({ tom: "erro", texto: e.message }),
    onSettled: () => { setConfirmar(null); return atualizar(); },
  });

  const recriar = useMutation({
    mutationFn: (postId: string) => chamarFuncao<{ status: string }>("chatfyre", { acao: "automacao_criar", conta_id: contaId, post_id: postId }),
    onMutate: () => setAviso(null),
    onSuccess: () => setAviso({ tom: "ok", texto: "Automação criada no Chatfyre, pausada." }),
    onError: (e) => setAviso({ tom: "erro", texto: e.message }),
    onSettled: atualizar,
  });

  const etapas = etapasDe(funil.data);
  const maior = Math.max(1, ...etapas.map((e) => e.valor));
  const gargalo = gargaloDe(funil.data);
  const nomeSelecionada =
    locais.data?.find((l) => l.chatfyre_id === selecionada)?.nome ?? externas.find((a) => a.id === selecionada)?.nome ?? "";
  const ocupado = status.isPending || recriar.isPending;

  return (
    <section className="pagina-entra">
      <PageHeader
        titulo="Automações de vendas"
        subtitulo="Comentou → DM → seguiu → link. Dados e ações via Chatfyre."
        icone={Zap}
        cor="yellow"
        acoes={<Segmentado rotulo="Período do funil" opcoes={PERIODOS} valor={dias} onChange={setDias} />}
      />

      {demo && <Card className="mb-6 text-label2">Modo demonstração: as automações vêm do Chatfyre e não aparecem aqui.</Card>}
      {aviso && (
        <div role={aviso.tom === "erro" ? "alert" : "status"}
          className={cn("mb-4 rounded-hig-lg px-4 py-3 text-foot", aviso.tom === "erro" ? "bg-red/10 text-red" : "bg-green/10 text-green")}>
          {aviso.texto}
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-t3 font-semibold">Funil</h2>
          {nomeSelecionada && <span className="text-foot text-label2">{nomeSelecionada}</span>}
          <Button tamanho="sm" variante="simples" className="ml-auto" onClick={() => funil.refetch()} disabled={!selecionada || funil.isFetching}>
            <RefreshCw className={cn(funil.isFetching && "animate-spin")} /> Atualizar
          </Button>
        </div>
        {!selecionada && <p className="mt-3 text-foot text-label2">Nenhuma automação no Chatfyre ainda. Ela nasce junto com um post publicado.</p>}
        {selecionada && funil.isLoading && <p className="mt-3 flex items-center gap-2 text-foot text-label2"><LoaderCircle className="size-4 animate-spin" /> Lendo o Chatfyre…</p>}
        {funil.error && <p role="alert" className="mt-3 text-foot text-red">{funil.error.message}</p>}
        {funil.data != null && (
          <>
            {etapas.length > 0 ? (
              <ol className="mt-4 grid gap-3">
                {etapas.map((e) => (
                  <li key={e.rotulo} className="grid grid-cols-[minmax(120px,200px)_1fr_auto] items-center gap-3 text-foot">
                    <span className="first-letter:uppercase text-label2">{e.rotulo}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-fill3">
                      <span className="block h-full rounded-full bg-orange" style={{ width: `${(e.valor / maior) * 100}%` }} />
                    </span>
                    <b className="tabular-nums">{e.valor.toLocaleString("pt-BR")}</b>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-foot text-label2">O Chatfyre respondeu, mas sem etapas de funil reconhecíveis. Veja os dados brutos abaixo.</p>
            )}
            {gargalo && <p className="mt-4 rounded-hig-lg bg-orange/10 px-4 py-3 text-foot">Gargalo: {gargalo}</p>}
            <details className="mt-4 text-cap1 text-label2">
              <summary className="cursor-pointer">Dados brutos do Chatfyre</summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded-hig-lg bg-fill3 p-3 whitespace-pre-wrap">{JSON.stringify(funil.data, null, 2)}</pre>
            </details>
          </>
        )}
      </Card>

      <Card className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-t3 font-semibold">Suas automações</h2>
          <Link to="/criar" className={cn(botao({ tamanho: "sm" }), "ml-auto")}><Plus /> Nova (junto com um post)</Link>
        </div>
        {locais.error && <p role="alert" className="mt-3 text-foot text-red">{locais.error.message}</p>}
        {chatfyre.error && <p role="alert" className="mt-3 text-foot text-red">Chatfyre: {chatfyre.error.message}</p>}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-foot">
            <thead className="text-cap1 text-label2">
              <tr><th className="py-2 pr-3 font-medium">Nome</th><th className="pr-3 font-medium">Post</th><th className="pr-3 font-medium">Palavra</th><th className="pr-3 font-medium">Fluxo</th><th className="pr-3 font-medium">Status</th><th /></tr>
            </thead>
            <tbody>
              {(locais.data ?? []).map((l) => {
                const fluxo = FLUXO_ROTULO[l.config_json?.fluxo ?? ""] ?? "—";
                const divergente = l.chatfyre_id && ativaNoChatfyre.has(l.chatfyre_id) && ativaNoChatfyre.get(l.chatfyre_id) !== (l.status === "ativa");
                return (
                  <tr key={l.id} className={cn("border-t border-sep align-top", selecionada === l.chatfyre_id && "bg-fill3/50")}>
                    <td className="py-3 pr-3">
                      <button type="button" className="text-left font-semibold" disabled={!l.chatfyre_id} onClick={() => setEscolhida(l.chatfyre_id)}>{l.nome ?? "Automação"}</button>
                      {l.erro && <p className="mt-1 text-cap1 text-red">{l.erro}</p>}
                      {divergente && <p className="mt-1 text-cap1 text-orange">O status no Chatfyre está diferente. Foi mudado pelo painel do Chatfyre?</p>}
                    </td>
                    <td className="py-3 pr-3">
                      {l.posts?.permalink
                        ? <a href={l.posts.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue">{l.posts.produto ?? "Post"} <ExternalLink className="size-3.5" /></a>
                        : <span className="text-label2">{l.posts?.produto ?? "—"}</span>}
                    </td>
                    <td className="py-3 pr-3">{l.palavra ?? "—"}</td>
                    <td className="py-3 pr-3 text-label2">{fluxo}{l.versao_fluxo ? ` · v${l.versao_fluxo}` : ""}</td>
                    <td className="py-3 pr-3"><StatusBadge status={l.status} /></td>
                    <td className="py-3 text-right">
                      {l.status === "erro" && !l.chatfyre_id && l.post_id && (
                        <Button tamanho="sm" variante="secundario" disabled={ocupado} onClick={() => recriar.mutate(l.post_id!)}><RefreshCw /> Criar de novo</Button>
                      )}
                      {l.chatfyre_id && dono && l.status !== "ativa" && confirmar !== l.id && (
                        <Button tamanho="sm" disabled={ocupado} onClick={() => setConfirmar(l.id)}><Play /> Ativar</Button>
                      )}
                      {l.chatfyre_id && dono && l.status === "ativa" && (
                        <Button tamanho="sm" variante="secundario" disabled={ocupado} onClick={() => status.mutate({ id: l.id, ativa: false })}><Pause /> Pausar</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(locais.data ?? []).map((l) => confirmar === l.id && (
                <tr key={`c-${l.id}`}>
                  <td colSpan={6} className="pb-4">
                    <div className="rounded-hig-lg bg-fill3 p-4">
                      <p className="text-sub">
                        Ativar <b>{l.nome}</b>? A partir de agora, quem comentar <b>"{l.palavra}"</b> no post recebe a DM de verdade.
                        {l.config_json?.so_seguidores && " O fluxo “só para quem segue” é publicado junto."}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <Button onClick={() => status.mutate({ id: l.id, ativa: true })} disabled={ocupado}>
                          {status.isPending ? <LoaderCircle className="animate-spin" /> : <Play />} Confirmar e ativar
                        </Button>
                        <Button variante="secundario" onClick={() => setConfirmar(null)} disabled={ocupado}>Cancelar</Button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {externas.map((a) => (
                <tr key={a.id} className={cn("border-t border-sep align-top", selecionada === a.id && "bg-fill3/50")}>
                  <td className="py-3 pr-3">
                    <button type="button" className="text-left font-semibold" onClick={() => setEscolhida(a.id)}>{a.nome}</button>
                    <p className="mt-1 text-cap1 text-label2">criada fora do estúdio · só leitura aqui</p>
                  </td>
                  <td className="py-3 pr-3 text-label2">—</td>
                  <td className="py-3 pr-3">{a.palavras.join(", ") || "—"}</td>
                  <td className="py-3 pr-3 text-label2">—</td>
                  <td className="py-3 pr-3"><StatusBadge status={a.ativa == null ? "externa" : a.ativa ? "externa-ativa" : "externa-pausada"} /></td>
                  <td />
                </tr>
              ))}
              {!locais.isLoading && !chatfyre.isLoading && !(locais.data ?? []).length && !externas.length && (
                <tr><td colSpan={6} className="py-6 text-center text-label2">Nenhuma automação ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {(locais.isLoading || chatfyre.isLoading) && <p className="mt-3 flex items-center gap-2 text-foot text-label2"><LoaderCircle className="size-4 animate-spin" /> Carregando…</p>}
        {!dono && <p className="mt-3 text-cap1 text-label2">Só o dono da conta ativa ou pausa automações.</p>}
      </Card>

      <Card className="mt-6 text-foot text-label2">
        Toda automação criada pelo estúdio nasce <b>pausada</b> e ligada ao <b>media_id</b> do post. Ativar é sempre uma decisão sua, nesta tela.
        Esta é a parte paga: o Chatfyre cobra plano Solo/Pro para o acesso pela API.
      </Card>
    </section>
  );
}
