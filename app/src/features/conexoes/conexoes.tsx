import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { RefreshCw } from "lucide-react";
import { Button, botao } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Cpu, Dna, HardDrive, Instagram, PlugZap, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { useDna } from "@/features/marca/dados";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Card } from "@/components/ui/hig";
import { Tile, type CorTile } from "@/components/ui/tile";
import { supabase } from "@/lib/supabase";
import { chamarFuncao } from "@/features/criar/dados";
import { useAcesso } from "@/features/auth/acesso";

type Provedor = "instagram" | "chatfyre" | "gemini" | "openai" | "heygen" | "fal" | "google";
type Status = "a_conectar" | "conectado" | "expirado" | "erro";
type Conexao = { provedor: Provedor; status: Status; detalhe: string | null; expira_em: string | null };

const VISUAL: Record<Provedor, { nome: string; icone: LucideIcon; cor: CorTile; pago: boolean }> = {
  instagram: { nome: "Instagram — API oficial", icone: Instagram, cor: "instagram", pago: false },
  chatfyre: { nome: "Chatfyre", icone: Zap, cor: "orange", pago: true },
  gemini: { nome: "Gemini", icone: Sparkles, cor: "indigo", pago: false },
  openai: { nome: "OpenAI", icone: Cpu, cor: "gray", pago: true },
  heygen: { nome: "HeyGen", icone: Cpu, cor: "purple", pago: true },
  fal: { nome: "fal.ai", icone: Cpu, cor: "gray", pago: true },
  google: { nome: "Google Drive", icone: HardDrive, cor: "blue", pago: false },
};

const STATUS: Record<Status, { texto: string; tom: "ok" | "aviso" | "neutro" }> = {
  conectado: { texto: "Conectado", tom: "ok" },
  a_conectar: { texto: "A conectar", tom: "neutro" },
  expirado: { texto: "Expirado", tom: "aviso" },
  erro: { texto: "Erro", tom: "aviso" },
};

const ORDEM: Provedor[] = ["instagram", "chatfyre", "gemini", "openai", "heygen", "fal"];

// Mesmos dados da migration (25/10/2026), usados só no modo demonstração.
const DEMO: Conexao[] = [
  { provedor: "instagram", status: "a_conectar", detalhe: "API oficial da Meta: publicar, agendar e métricas (Fase 2)", expira_em: null },
  { provedor: "chatfyre", status: "conectado", detalhe: "Automações comentário → DM · @wsasistemas.ia", expira_em: "2026-12-25T02:29:00Z" },
  { provedor: "gemini", status: "a_conectar", detalhe: "Legendas, prompts e edição por chat (Fase 4)", expira_em: null },
  { provedor: "openai", status: "a_conectar", detalhe: "Imagens por IA (Fase 7) · pago por uso", expira_em: null },
  { provedor: "heygen", status: "a_conectar", detalhe: "Vídeo com avatar (Fase 7) · pago por uso", expira_em: null },
  { provedor: "fal", status: "a_conectar", detalhe: "Alternativa “tudo em um” (Fase 7) · pago por uso", expira_em: null },
];

const CUSTOS: [string, string, string, boolean][] = [
  ["Telas (frontend)", "React + Vite + Tailwind + shadcn na Vercel (Hobby)", "R$ 0", true],
  ["Banco, login, arquivos", "Supabase ikvj (schema imobinsta)", "R$ 0", true],
  ["Carrossel e posts", "Templates HTML → PNG", "R$ 0", true],
  ["Reels de fotos", "Remotion rodando no seu PC", "R$ 0", true],
  ["Textos e edição por chat", "Gemini API (cota gratuita diária)", "R$ 0", true],
  ["Publicar, agendar, métricas", "Instagram Graph API (app próprio na Meta)", "R$ 0", true],
  ["Imagem criada 100% por IA", "OpenAI GPT Image (ou fal.ai)", "por uso · teto mensal", false],
  ["Vídeo narrado com avatar", "HeyGen (ou fal.ai)", "por uso · teto mensal", false],
  ["Automação comentário → DM", "Chatfyre (plano com acesso por API)", "plano Chatfyre", false],
];

function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function diasAte(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 3600 * 1000));
}

export function Conexoes() {
  const { demo, conta } = useAcesso();
  const { data, isLoading, error } = useQuery({
    queryKey: ["conexoes", conta?.conta_id, demo],
    queryFn: async () => {
      if (demo) return DEMO;
      const { data, error } = await supabase
        .from("conexoes")
        .select("provedor, status, detalhe, expira_em")
        .eq("conta_id", conta!.conta_id);
      if (error) throw error;
      return data as Conexao[];
    },
    enabled: demo || !!conta,
  });

  const cliente = useQueryClient();
  const sync = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ posts: number; seguidores: number | null; erro?: string }>(
        "ig-sync",
        { body: { conta_id: conta!.conta_id } },
      );
      if (error) {
        const corpo = "context" in error ? await (error.context as Response).json().catch(() => null) : null;
        throw new Error(corpo?.erro ?? "Não foi possível sincronizar.");
      }
      return data!;
    },
    onSettled: () => {
      for (const chave of ["conexoes", "posts", "metricas_conta"]) cliente.invalidateQueries({ queryKey: [chave] });
    },
  });

  // O Google aparece na seção "Google · grátis", não na grade.
  const lista = (data ?? []).filter((c) => c.provedor !== "google").sort((a, b) => ORDEM.indexOf(a.provedor) - ORDEM.indexOf(b.provedor));
  const google = data?.find((c) => c.provedor === "google");

  return (
    <section className="pagina-entra">
      <PageHeader titulo="Conexões e custos" subtitulo="O que cada parte usa e quanto custa" icone={PlugZap} cor="gray" />

      {error && (
        <Card className="mb-6 text-red">Não foi possível carregar as conexões. Atualize a página.</Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy={isLoading}>
        {isLoading
          ? Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[104px] animate-pulse rounded-hig-xl bg-bg2" />)
          : lista.map((c) => {
              const v = VISUAL[c.provedor];
              const s = STATUS[c.status];
              return (
                <Card key={c.provedor} className="flex items-start gap-4 p-5">
                  <Tile icone={v.icone} cor={v.cor} tamanho="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-sub font-semibold">{v.nome}</b>
                      {v.pago && <Badge tom="aviso">pago</Badge>}
                    </div>
                    <p className="mt-1 text-foot text-label2">{c.detalhe}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge tom={s.tom}>{s.texto}</Badge>
                      {c.expira_em && <span className="text-cap1 text-label2">token até {dataCurta(c.expira_em)}</span>}
                    </div>
                    {c.provedor === "instagram" && c.status !== "conectado" && (
                      <Link to="/conexoes/instagram" className={cn(botao({ tamanho: "sm" }), "mt-3")}>
                        {c.status === "expirado" ? "Conectar de novo" : "Configurar"}
                      </Link>
                    )}
                    {c.provedor === "instagram" && c.status === "conectado" && c.expira_em && diasAte(c.expira_em) <= 10 && (
                      <p className="mt-2 text-cap1 text-orange">
                        O token vence em {Math.max(diasAte(c.expira_em), 0)} dias.{" "}
                        <Link to="/conexoes/instagram" className="font-semibold underline">Conectar de novo</Link> para renovar por mais 60.
                      </p>
                    )}
                    {c.provedor === "instagram" && c.status === "conectado" && (
                      <Button tamanho="sm" variante="secundario" className="mt-3" onClick={() => sync.mutate()} disabled={sync.isPending || demo}>
                        <RefreshCw className={cn(sync.isPending && "animate-spin")} />
                        {sync.isPending ? "Sincronizando…" : "Sincronizar agora"}
                      </Button>
                    )}
                    {c.provedor === "gemini" && conta?.papel === "dono" && !demo && <ChaveGemini contaId={conta.conta_id} conectado={c.status === "conectado"} />}
                    {c.provedor === "chatfyre" && !demo && conta && <PacoteChatfyre contaId={conta.conta_id} dono={conta.papel === "dono"} />}
                    {(c.provedor === "openai" || c.provedor === "heygen" || c.provedor === "fal") && conta?.papel === "dono" && !demo && (
                      <ChaveProvedor contaId={conta.conta_id} provedor={c.provedor} conectado={c.status === "conectado"} />
                    )}
                    {c.provedor === "instagram" && (sync.data || sync.error) && (
                      <p role="status" className={cn("mt-2 text-cap1", sync.error ? "text-red" : "text-green")}>
                        {sync.error ? sync.error.message : `${sync.data!.posts} posts · ${sync.data!.seguidores ?? "?"} seguidores`}
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
      </div>

      <p className="mt-4 text-foot text-label2">
        Chaves e tokens ficam no Vault do Supabase e só as Edge Functions os usam. Esta tela mostra apenas o status.
      </p>

      {!demo && conta && <GoogleGratis contaId={conta.conta_id} dono={conta.papel === "dono"} conexao={google} />}
      {!demo && conta && <TetoIa contaId={conta.conta_id} dono={conta.papel === "dono"} />}

      <Card className="mt-8 overflow-x-auto">
        <h2>Custo mensal estimado</h2>
        <table className="mt-3 w-full min-w-[560px] text-sub">
          <thead>
            <tr className="text-left text-foot text-label2">
              <th className="border-b-[0.5px] px-2 py-3 font-medium">Parte</th>
              <th className="border-b-[0.5px] px-2 py-3 font-medium">Tecnologia</th>
              <th className="border-b-[0.5px] px-2 py-3 font-medium">Custo</th>
            </tr>
          </thead>
          <tbody>
            {CUSTOS.map(([parte, tec, custo, gratis]) => (
              <tr key={parte}>
                <td className="border-b-[0.5px] px-2 py-3">{parte}</td>
                <td className="border-b-[0.5px] px-2 py-3 text-label2">{tec}</td>
                <td className={`border-b-[0.5px] px-2 py-3 font-semibold ${gratis ? "text-green" : "text-orange"}`}>{custo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

/** Cola a chave do Gemini (AI Studio). Vai direto para a Edge Function, que testa e guarda no Vault. */
function ChaveGemini({ contaId, conectado }: { contaId: string; conectado: boolean }) {
  const cliente = useQueryClient();
  const [aberto, setAberto] = useState(!conectado);
  const [chave, setChave] = useState("");
  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("ia-texto", { body: { acao: "chave", conta_id: contaId, chave } });
      if (error) {
        const corpo = "context" in error ? await (error.context as Response).json().catch(() => null) : null;
        throw new Error(corpo?.erro ?? "Não foi possível salvar a chave.");
      }
    },
    onSuccess: () => {
      setChave("");
      setAberto(false);
      cliente.invalidateQueries({ queryKey: ["conexoes"] });
    },
  });
  if (!aberto) {
    return <Button tamanho="sm" variante="secundario" className="mt-3" onClick={() => setAberto(true)}>Trocar chave</Button>;
  }
  return (
    <form className="mt-3" onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }}>
      <div className="flex gap-2">
        <input
          className="campo min-h-9 py-1.5 text-foot"
          type="password"
          autoComplete="off"
          placeholder="Chave do Google AI Studio"
          aria-label="Chave do Gemini"
          value={chave}
          onChange={(e) => setChave(e.target.value)}
        />
        <Button type="submit" tamanho="sm" disabled={chave.trim().length < 20 || salvar.isPending}>{salvar.isPending ? "Testando…" : "Salvar"}</Button>
      </div>
      {salvar.error && <p role="alert" className="mt-2 text-cap1 text-red">{salvar.error.message}</p>}
      <p className="mt-2 text-cap1 text-label2">
        Gere em <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-blue underline">aistudio.google.com/apikey</a>. A chave não fica no navegador.
      </p>
    </form>
  );
}

/** Seção "Google · grátis" (Fases 10 e 11): DNA da marca pelo Gemini e a conexão com o Drive (ponte com o Vids). */
function GoogleGratis({ contaId, dono, conexao }: { contaId: string; dono: boolean; conexao?: Conexao }) {
  const dna = useDna();
  return (
    <Card className="mt-8 ring-1 ring-blue/40">
      <div className="flex flex-wrap items-center gap-3">
        <h2>Google · grátis</h2>
        <Badge tom="ok" className="ml-auto">R$ 0 · cota gratuita</Badge>
      </div>
      <p className="mt-2 text-foot text-label2">
        O Pomelli e o Google Vids não têm API: o estúdio faz o DNA da marca por dentro, com o Gemini, e conversa com o Vids pelo seu Google Drive.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="flex items-start gap-4 rounded-hig-xl bg-fill3 p-4">
          <Tile icone={Dna} cor="pink" tamanho="lg" />
          <div className="min-w-0">
            <b className="text-sub font-semibold">DNA da marca</b>
            <p className="mt-1 text-foot text-label2">Lê o site e guarda cores, fontes, imagens e tom de voz. Guia legendas, posts, roteiros e campanhas.</p>
            <div className="mt-2">
              {dna.data ? <Badge tom="ok">Pronto · {dna.data.site_url?.replace(/^https?:\/\//, "").replace(/\/$/, "")}</Badge> : <Badge>A ler</Badge>}
            </div>
            <Link to="/marca" className={cn(botao({ tamanho: "sm", variante: "secundario" }), "mt-3")}>Abrir DNA da marca</Link>
          </div>
        </div>
        <div className="flex items-start gap-4 rounded-hig-xl bg-fill3 p-4">
          <Tile icone={HardDrive} cor="blue" tamanho="lg" />
          <div className="min-w-0">
            <b className="text-sub font-semibold">Google Drive + Vids</b>
            <p className="mt-1 text-foot text-label2">Manda o roteiro para o Google Vids e traz o MP4 pronto para virar Reels.</p>
            <ConectarGoogle contaId={contaId} dono={dono} conexao={conexao} />
          </div>
        </div>
        <div className="flex items-start gap-4 rounded-hig-xl bg-fill3 p-4 opacity-70">
          <Tile icone={Cpu} cor="indigo" tamanho="lg" />
          <div className="min-w-0">
            <b className="text-sub font-semibold">Veo 3.1</b>
            <p className="mt-1 text-foot text-label2">Clipes de 8 s do Google, com a chave do Gemini. Pago por segundo, dentro do teto.</p>
            <Badge tom="aviso" className="mt-2">Fase 11 · pago por uso</Badge>
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * Conexão com o Google Drive (escopo drive.file: o estúdio só enxerga o que ele mesmo criar).
 * O consentimento acontece no Google; a google-oauth volta para /conexoes com google_ok ou google_erro.
 */
function ConectarGoogle({ contaId, dono, conexao }: { contaId: string; dono: boolean; conexao?: Conexao }) {
  const cliente = useQueryClient();
  const [params, setParams] = useSearchParams();
  const retorno = params.get("google_erro") ?? (params.get("google_ok") ? "ok" : null);
  const conectar = useMutation({
    mutationFn: () => chamarFuncao<{ url: string }>("google-oauth", { conta_id: contaId }),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const testar = useMutation({
    mutationFn: () => chamarFuncao<{ email: string | null }>("google-oauth", { conta_id: contaId, acao: "testar" }),
    onSettled: () => cliente.invalidateQueries({ queryKey: ["conexoes"] }),
  });
  const status = conexao?.status ?? "a_conectar";
  const s = STATUS[status];

  function limparRetorno() {
    params.delete("google_ok");
    params.delete("google_erro");
    setParams(params, { replace: true });
  }

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tom={s.tom}>{s.texto}</Badge>
        {conexao?.status === "conectado" && conexao.detalhe && <span className="text-cap1 text-label2">{conexao.detalhe.replace(/^Google Drive · /, "")}</span>}
      </div>
      {retorno && (
        <p role={retorno === "ok" ? "status" : "alert"} className={cn("mt-2 text-cap1", retorno === "ok" ? "text-green" : "text-red")}>
          {retorno === "ok" ? "Google Drive conectado." : retorno}{" "}
          <button type="button" className="underline" onClick={limparRetorno}>Fechar</button>
        </p>
      )}
      {dono ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button tamanho="sm" variante={status === "conectado" ? "secundario" : undefined} onClick={() => conectar.mutate()} disabled={conectar.isPending || conectar.isSuccess}>
            {conectar.isPending || conectar.isSuccess ? "Abrindo o Google…" : status === "conectado" ? "Conectar de novo" : "Conectar Google"}
          </Button>
          {status === "conectado" && (
            <Button tamanho="sm" variante="secundario" onClick={() => testar.mutate()} disabled={testar.isPending}>
              <RefreshCw className={cn(testar.isPending && "animate-spin")} /> {testar.isPending ? "Testando…" : "Testar"}
            </Button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-cap1 text-label2">Só o dono da conta conecta o Google.</p>
      )}
      {(conectar.error || testar.error) && <p role="alert" className="mt-2 text-cap1 text-red">{(conectar.error ?? testar.error)!.message}</p>}
      {testar.data && <p role="status" className="mt-2 text-cap1 text-green">O estúdio acessou o Drive de {testar.data.email ?? "sua conta"}.</p>}
    </>
  );
}

const AJUDA_CHAVE: Record<"openai" | "heygen" | "fal", { placeholder: string; url: string; site: string }> = {
  openai: { placeholder: "sk-… (chave de API, não a assinatura do ChatGPT)", url: "https://platform.openai.com/api-keys", site: "platform.openai.com/api-keys" },
  heygen: { placeholder: "Chave de API da HeyGen", url: "https://app.heygen.com/settings?nav=API", site: "app.heygen.com → Settings → API" },
  fal: { placeholder: "Chave de API da fal.ai", url: "https://fal.ai/dashboard/keys", site: "fal.ai/dashboard/keys" },
};

/** Chave de provedor pago (OpenAI, HeyGen, fal.ai). A Edge Function ia-imagem testa quando dá e guarda no Vault. */
function ChaveProvedor({ contaId, provedor, conectado }: { contaId: string; provedor: "openai" | "heygen" | "fal"; conectado: boolean }) {
  const cliente = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [chave, setChave] = useState("");
  const ajuda = AJUDA_CHAVE[provedor];
  const salvar = useMutation({
    mutationFn: () => chamarFuncao<{ testada: boolean }>("ia-imagem", { acao: "chave", conta_id: contaId, provedor, chave: chave.trim() }),
    onSuccess: () => {
      setChave("");
      setAberto(false);
      cliente.invalidateQueries({ queryKey: ["conexoes"] });
    },
  });
  if (!aberto) {
    return (
      <Button tamanho="sm" variante="secundario" className="mt-3" onClick={() => setAberto(true)}>
        {conectado ? "Trocar chave" : "Colar chave"}
      </Button>
    );
  }
  return (
    <form className="mt-3" onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }}>
      <div className="flex gap-2">
        <input className="campo min-h-9 py-1.5 text-foot" type="password" autoComplete="off" placeholder={ajuda.placeholder}
          aria-label={`Chave ${provedor}`} value={chave} onChange={(e) => setChave(e.target.value)} />
        <Button type="submit" tamanho="sm" disabled={chave.trim().length < 16 || salvar.isPending}>{salvar.isPending ? "Testando…" : "Salvar"}</Button>
      </div>
      {salvar.error && <p role="alert" className="mt-2 text-cap1 text-red">{salvar.error.message}</p>}
      <p className="mt-2 text-cap1 text-label2">
        Gere em <a href={ajuda.url} target="_blank" rel="noreferrer" className="text-blue underline">{ajuda.site}</a>. A chave não fica no navegador.
      </p>
    </form>
  );
}

type ConfigIa = { teto_mensal_usd: number; confirmar_acima_usd: number; provedor_imagem: "openai" | "fal" };

/** Teto mensal da IA paga (PRD R12): bloqueia ao atingir e pede confirmação acima de um valor por geração. */
function TetoIa({ contaId, dono }: { contaId: string; dono: boolean }) {
  const cliente = useQueryClient();
  const atual = useQuery({
    queryKey: ["config-ia", contaId],
    queryFn: async () => {
      const [{ data, error }, gasto] = await Promise.all([
        supabase.from("config_ia").select("teto_mensal_usd, confirmar_acima_usd, provedor_imagem").eq("conta_id", contaId).maybeSingle(),
        supabase.rpc("gasto_ia_mes", { p_conta: contaId }),
      ]);
      if (error) throw error;
      if (gasto.error) throw gasto.error;
      const cfg: ConfigIa = data
        ? { teto_mensal_usd: Number(data.teto_mensal_usd), confirmar_acima_usd: Number(data.confirmar_acima_usd), provedor_imagem: data.provedor_imagem }
        : { teto_mensal_usd: 30, confirmar_acima_usd: 2, provedor_imagem: "openai" };
      return { cfg, gasto: Number(gasto.data ?? 0) };
    },
  });
  if (atual.isLoading) return <div className="mt-8 h-40 animate-pulse rounded-hig-xl bg-bg2" />;
  if (atual.error) return <Card className="mt-8 text-red">Não foi possível ler o teto de gasto: {atual.error.message}</Card>;
  return <FormTeto key={JSON.stringify(atual.data!.cfg)} contaId={contaId} dono={dono} inicial={atual.data!.cfg} gasto={atual.data!.gasto}
    aoSalvar={() => cliente.invalidateQueries({ queryKey: ["config-ia"] })} />;
}

function FormTeto({ contaId, dono, inicial, gasto, aoSalvar }: { contaId: string; dono: boolean; inicial: ConfigIa; gasto: number; aoSalvar: () => void }) {
  const [cfg, setCfg] = useState(inicial);
  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("config_ia").upsert({ conta_id: contaId, ...cfg, atualizado_em: new Date().toISOString() });
      if (error) throw new Error(error.message);
    },
    onSuccess: aoSalvar,
  });
  const pct = Math.min(100, (gasto / Math.max(cfg.teto_mensal_usd, 0.01)) * 100);
  const mudou = JSON.stringify(cfg) !== JSON.stringify(inicial);
  return (
    <Card className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2>IA paga: teto de gasto</h2>
        <Badge tom="aviso" className="ml-auto">pago por uso · com teto mensal</Badge>
      </div>
      <p className="mt-2 text-foot text-label2">
        Gasto neste mês: <b className="text-label">US$ {gasto.toFixed(2)}</b> de US$ {cfg.teto_mensal_usd.toFixed(2)}. Ao atingir o teto, novas gerações são bloqueadas.
      </p>
      <div className="mt-3 h-2 max-w-xl overflow-hidden rounded-full bg-fill3">
        <div className={cn("h-full rounded-full", pct >= 90 ? "bg-red" : pct >= 70 ? "bg-orange" : "bg-green")} style={{ width: `${pct}%` }} />
      </div>
      <fieldset disabled={!dono} className="mt-5 grid max-w-xl gap-3 sm:grid-cols-[220px_1fr] sm:items-center">
        <label htmlFor="teto" className="text-foot text-label2">Teto de gasto mensal (US$)</label>
        <input id="teto" type="number" min={0} max={10000} step={1} className="campo max-w-40" value={cfg.teto_mensal_usd}
          onChange={(e) => setCfg({ ...cfg, teto_mensal_usd: Math.max(0, Number(e.target.value) || 0) })} />
        <label htmlFor="confirmar" className="text-foot text-label2">Pedir confirmação acima de (US$ por geração)</label>
        <input id="confirmar" type="number" min={0} max={1000} step={0.5} className="campo max-w-40" value={cfg.confirmar_acima_usd}
          onChange={(e) => setCfg({ ...cfg, confirmar_acima_usd: Math.max(0, Number(e.target.value) || 0) })} />
        <label htmlFor="prov-img" className="text-foot text-label2">Provedor de imagem</label>
        <select id="prov-img" className="campo max-w-60" value={cfg.provedor_imagem} onChange={(e) => setCfg({ ...cfg, provedor_imagem: e.target.value as ConfigIa["provedor_imagem"] })}>
          <option value="openai">OpenAI (GPT Image)</option>
          <option value="fal">fal.ai (FLUX)</option>
        </select>
      </fieldset>
      {dono ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button tamanho="sm" onClick={() => salvar.mutate()} disabled={!mudou || salvar.isPending}>{salvar.isPending ? "Salvando…" : "Salvar"}</Button>
          {salvar.error && <span role="alert" className="text-cap1 text-red">{salvar.error.message}</span>}
          {salvar.isSuccess && !mudou && <span role="status" className="text-cap1 text-green">Salvo.</span>}
        </div>
      ) : (
        <p className="mt-3 text-cap1 text-label2">Só o dono da conta muda o teto.</p>
      )}
    </Card>
  );
}

type FerramentaChatfyre = { nome: string; descricao: string; parametros: unknown };
type RespostaChatfyre = { ferramentas: FerramentaChatfyre[]; escrita?: string[] };

/**
 * Liga o Chatfyre ao estúdio. O pacote vem do script local (o OAuth do Chatfyre só aceita o redirect do claude.ai):
 * a Edge Function testa, guarda no Vault e devolve as ferramentas liberadas.
 */
function PacoteChatfyre({ contaId, dono }: { contaId: string; dono: boolean }) {
  const cliente = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [pacote, setPacote] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [ultima, setUltima] = useState<"salvar" | "testar">("testar");
  const salvar = useMutation({
    mutationFn: () => chamarFuncao<RespostaChatfyre>("chatfyre", { acao: "credenciais", conta_id: contaId, pacote: pacote.trim() }),
    onMutate: () => setUltima("salvar"),
    onSuccess: () => {
      setPacote("");
      setAberto(false);
    },
    onSettled: () => cliente.invalidateQueries({ queryKey: ["conexoes"] }),
  });
  const testar = useMutation({
    mutationFn: () => chamarFuncao<RespostaChatfyre>("chatfyre", { acao: "diagnostico", conta_id: contaId }),
    onMutate: () => setUltima("testar"),
    onSettled: () => cliente.invalidateQueries({ queryKey: ["conexoes"] }),
  });
  // Só mostra a ação mais recente, senão um erro antigo fica na tela ao lado de um sucesso novo.
  const atual = ultima === "salvar" ? salvar : testar;
  const resultado = atual.data;
  const erro = atual.error;

  async function copiar() {
    await navigator.clipboard.writeText(JSON.stringify(resultado?.ferramentas ?? [], null, 2));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <Button tamanho="sm" variante="secundario" onClick={() => testar.mutate()} disabled={testar.isPending}>
          <RefreshCw className={cn(testar.isPending && "animate-spin")} /> {testar.isPending ? "Testando…" : "Testar pelo estúdio"}
        </Button>
        {dono && !aberto && <Button tamanho="sm" variante="secundario" onClick={() => setAberto(true)}>Colar pacote</Button>}
      </div>
      {dono && aberto && (
        <form className="mt-3" onSubmit={(e) => { e.preventDefault(); salvar.mutate(); }}>
          <div className="flex gap-2">
            <input
              className="campo min-h-9 py-1.5 text-foot"
              type="password"
              autoComplete="off"
              placeholder="Pacote copiado pelo script"
              aria-label="Pacote do Chatfyre"
              value={pacote}
              onChange={(e) => setPacote(e.target.value)}
            />
            <Button type="submit" tamanho="sm" disabled={pacote.trim().length < 20 || salvar.isPending}>{salvar.isPending ? "Testando…" : "Salvar"}</Button>
          </div>
          <p className="mt-2 text-cap1 text-label2">
            No PowerShell, na pasta do projeto: <code className="rounded bg-fill3 px-1">.\scripts\chatfyre-token.ps1 -Exportar</code>. Faça o login,
            e o pacote vai direto para a área de transferência. Não cole no chat.
          </p>
        </form>
      )}
      {erro && <p role="alert" className="mt-2 text-cap1 text-red">{erro.message}</p>}
      {resultado && (
        <div role="status" className="mt-2 text-cap1 text-label2">
          <p className="text-green">
            Estúdio falou com o Chatfyre: {resultado.ferramentas.length} ferramentas
            {resultado.escrita ? ` · escrita: ${resultado.escrita.length ? resultado.escrita.join(", ") : "nenhuma"}` : ""}.
          </p>
          <p className="mt-1 break-words">{resultado.ferramentas.map((f) => f.nome).join(", ")}</p>
          <Button tamanho="sm" variante="simples" className="mt-1 -ml-3" onClick={copiar}>{copiado ? "Copiado" : "Copiar lista técnica"}</Button>
        </div>
      )}
    </div>
  );
}
