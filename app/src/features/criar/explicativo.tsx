import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Clapperboard, ImagePlus, LoaderCircle, Plus, Sparkles, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge, Card, Segmentado } from "@/components/ui/hig";
import { useAcesso } from "@/features/auth/acesso";
import { useAvatares } from "@/features/avatares/avatares";
import { type Midia, useMidias } from "@/features/midias/dados";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Nota, Rotulo } from "./comum";
import { chamarFuncao } from "./dados";
import { type Cena, LAYOUTS, type Layout, segundosDa } from "./cenas";
import { PRODUTOS } from "./esquema";
import { SeletorMidia } from "./seletor-midia";

type Objetivo = "engajar" | "vender" | "ensinar";
type Roteiro = {
  id: string; titulo: string; produto: string | null; legenda: string | null; avatar_id: string | null; objetivo: Objetivo | null;
  projeto_json: { midias?: string[]; segundos?: number };
};
type Gerado = { titulo: string; legenda: string; hashtags: string[]; cenas: { fala: string; layout: Layout; fundo_midia_id: string | null }[] };

const SEGUNDOS = ["30", "45", "60", "90"] as const;
const CAMPOS_CENA = "id, ordem, fala, layout, fundo_midia_id, look_id, montagem, status, avatar_midia_id, fala_gerada, erro";

/**
 * Vídeo explicativo com avatar + telas do sistema (Fase 13). 13.1: roteiro em cenas (IA) com layout e fundo por cena.
 * 13.2 gera o avatar de cada cena na HeyGen; 13.3 monta o vídeo no navegador. ?roteiro=<id> retoma.
 */
export function VideoExplicativo() {
  const { conta, demo } = useAcesso();
  const contaId = conta?.conta_id;
  const cliente = useQueryClient();
  const [params, setParams] = useSearchParams();
  const roteiroId = params.get("roteiro");
  const avatares = useAvatares();
  const { data: midias = [] } = useMidias();
  const ativos = (avatares.data ?? []).filter((a) => a.ativo);

  const [produto, setProduto] = useState<string>(PRODUTOS[0]);
  const [objetivo, setObjetivo] = useState<Objetivo>("vender");
  const [segundos, setSegundos] = useState<(typeof SEGUNDOS)[number]>("45");
  const [avatarId, setAvatarId] = useState("");
  const [tema, setTema] = useState("");
  const [telas, setTelas] = useState<string[]>([]);
  const [escolhendo, setEscolhendo] = useState(false);

  const roteiro = useQuery({
    queryKey: ["roteiro-cenas", roteiroId],
    enabled: !!roteiroId && !demo,
    queryFn: async () => {
      const [r, c] = await Promise.all([
        supabase.from("roteiros").select("id, titulo, produto, legenda, avatar_id, objetivo, projeto_json").eq("id", roteiroId!).single(),
        supabase.from("roteiro_cenas").select(CAMPOS_CENA).eq("roteiro_id", roteiroId!).order("ordem"),
      ]);
      if (r.error) throw r.error;
      if (c.error) throw c.error;
      return { roteiro: r.data as Roteiro, cenas: c.data as Cena[] };
    },
  });
  const recarregar = () => cliente.invalidateQueries({ queryKey: ["roteiro-cenas", roteiroId] });

  const recentes = useQuery({
    queryKey: ["roteiros-cenas-recentes", contaId],
    enabled: !!contaId && !demo && !roteiroId,
    queryFn: async () => {
      const { data, error } = await supabase.from("roteiros").select("id, titulo, criado_em").eq("conta_id", contaId!).eq("tipo", "cenas")
        .order("criado_em", { ascending: false }).limit(6);
      if (error) throw error;
      return data as { id: string; titulo: string; criado_em: string }[];
    },
  });

  const escrever = useMutation({
    mutationFn: async () => {
      const g = await chamarFuncao<Gerado>("ia-texto", {
        acao: "roteiro_cenas", conta_id: contaId, produto, objetivo, segundos: Number(segundos), midia_ids: telas, tema: tema.trim() || undefined,
      });
      const texto = g.cenas.map((c) => c.fala).join("\n\n");
      const { data: r, error } = await supabase.from("roteiros").insert({
        conta_id: contaId, tipo: "cenas", titulo: g.titulo, produto, objetivo, texto, avatar_id: avatarId || null,
        legenda: [g.legenda, g.hashtags.join(" ")].filter(Boolean).join("\n\n"), projeto_json: { midias: telas, segundos: Number(segundos) },
      }).select("id").single();
      if (error) throw new Error(error.message);
      const { error: eC } = await supabase.from("roteiro_cenas").insert(g.cenas.map((c, i) => ({
        roteiro_id: r.id, conta_id: contaId, ordem: i + 1, fala: c.fala, layout: c.layout, fundo_midia_id: c.fundo_midia_id,
      })));
      if (eC) throw new Error(eC.message);
      return r.id as string;
    },
    onSuccess: (id) => setParams({ roteiro: id }),
  });

  if (roteiroId) {
    return <EditorCenas roteiroId={roteiroId} dados={roteiro.data} carregando={roteiro.isLoading} erro={roteiro.error?.message}
      midias={midias} avatares={ativos} recarregar={recarregar} aoSair={() => setParams({})} />;
  }

  const thumb = (id: string) => midias.find((m) => m.id === id);
  return (
    <section className="pagina-entra">
      <PageHeader titulo="Vídeo explicativo com avatar" subtitulo="Você (avatar) apresentando o sistema, com as telas dele no vídeo" icone={Clapperboard} cor="purple" />
      {demo && <Nota className="mb-5">Modo demonstração: o roteiro não é salvo.</Nota>}
      {!avatares.isLoading && !ativos.length && (
        <Nota className="mb-5">Nenhum avatar cadastrado. Dá para escrever o roteiro agora; para gerar o vídeo, cadastre o seu em <Link to="/avatares" className="text-blue">Meus avatares</Link>.</Nota>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <Rotulo>Sistema</Rotulo>
          <select aria-label="Sistema" className="campo" value={produto} onChange={(e) => setProduto(e.target.value)}>
            {PRODUTOS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <Rotulo>Objetivo</Rotulo>
          <Segmentado rotulo="Objetivo" valor={objetivo} onChange={setObjetivo}
            opcoes={[{ valor: "engajar", rotulo: "Engajar" }, { valor: "vender", rotulo: "Vender" }, { valor: "ensinar", rotulo: "Ensinar" }]} />
          <Rotulo>Duração</Rotulo>
          <Segmentado rotulo="Duração" valor={segundos} onChange={setSegundos} opcoes={SEGUNDOS.map((s) => ({ valor: s, rotulo: `${s} s` }))} />
          <Rotulo>Avatar e voz</Rotulo>
          <select aria-label="Avatar" className="campo" value={avatarId} onChange={(e) => setAvatarId(e.target.value)}>
            <option value="">{ativos.length ? "Escolha…" : "Nenhum cadastrado"}</option>
            {ativos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
          <Rotulo>Tema (opcional)</Rotulo>
          <textarea className="campo min-h-20" maxLength={1000} value={tema} onChange={(e) => setTema(e.target.value)}
            placeholder="Ex.: como o funil avisa o corretor do lead esquecido" />
          <Rotulo>Telas do sistema <small>(prints e gravações do Banco)</small></Rotulo>
          <div className="grid grid-cols-4 gap-2">
            {telas.map((id) => {
              const m = thumb(id);
              return (
                <span key={id} className="relative aspect-square overflow-hidden rounded-hig-lg bg-bg3">
                  {m?.url && (m.tipo === "video" ? <video src={m.url} muted className="size-full object-cover" /> : <img src={m.url} alt={m.nome} className="size-full object-cover" />)}
                  <button type="button" aria-label="Tirar" onClick={() => setTelas((t) => t.filter((x) => x !== id))}
                    className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"><X className="size-3.5" /></button>
                </span>
              );
            })}
            {telas.length < 12 && (
              <button type="button" onClick={() => setEscolhendo(true)} disabled={demo}
                className="grid aspect-square place-items-center rounded-hig-lg border border-dashed border-sep text-label2 hover:text-blue"><ImagePlus /></button>
            )}
          </div>
          <Button className="mt-6 w-full" onClick={() => escrever.mutate()} disabled={demo || !contaId || escrever.isPending}>
            {escrever.isPending ? <LoaderCircle className="animate-spin" /> : <Sparkles />} {escrever.isPending ? "Escrevendo as cenas…" : "Escrever roteiro com IA"}
          </Button>
          {escrever.error && <p role="alert" className="mt-3 text-foot text-red">{escrever.error.message}</p>}
        </Card>

        <div className="grid gap-5">
          <Card>
            <h3>Como funciona</h3>
            <ol className="mt-3 ml-5 list-decimal text-foot leading-7 text-label2">
              <li>A IA escreve a fala dividida em cenas e escolhe, para cada uma, o layout e a tela do sistema.</li>
              <li>Você ajusta as falas, o layout e o fundo de cada cena.</li>
              <li>O avatar de cada cena é gerado na HeyGen (crédito de API; mostra o custo antes).</li>
              <li>A montagem (posição do avatar, legenda, logo, formato) é feita aqui, de graça, e o MP4 segue para o Publicar.</li>
            </ol>
          </Card>
          {!!recentes.data?.length && (
            <Card>
              <h3>Roteiros recentes</h3>
              <ul className="mt-2 divide-y divide-sep">
                {recentes.data.map((r) => (
                  <li key={r.id}><button type="button" onClick={() => setParams({ roteiro: r.id })} className="flex w-full items-center gap-3 py-2.5 text-left text-foot hover:text-blue">
                    <span className="truncate">{r.titulo}</span><span className="ml-auto text-cap1 text-label2">{new Date(r.criado_em).toLocaleDateString("pt-BR")}</span>
                  </button></li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <SeletorMidia aberto={escolhendo} max={12 - telas.length} tipos={["imagem", "video"]} titulo="Telas do sistema"
        onFechar={() => setEscolhendo(false)}
        onEscolher={(m) => { setEscolhendo(false); setTelas((t) => [...t, ...m.map((x) => x.id).filter((id) => !t.includes(id))].slice(0, 12)); }} />
    </section>
  );
}

function EditorCenas({ roteiroId, dados, carregando, erro, midias, avatares, recarregar, aoSair }: {
  roteiroId: string; dados?: { roteiro: Roteiro; cenas: Cena[] }; carregando: boolean; erro?: string;
  midias: (Midia & { url: string | null })[]; avatares: { id: string; nome: string }[];
  recarregar: () => Promise<unknown>; aoSair: () => void;
}) {
  const { conta, demo } = useAcesso();
  const [aviso, setAviso] = useState<string | null>(null);
  const [escolhendoFundo, setEscolhendoFundo] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: async (p: { tabela: "roteiros" | "roteiro_cenas"; id: string; campos: Record<string, unknown> }) => {
      const { error } = await supabase.from(p.tabela).update(p.campos).eq("id", p.id);
      if (error) throw new Error(error.message);
      // A fala inteira fica também em roteiros.texto (legado da Fase 7 e base da legenda).
      if (p.tabela === "roteiro_cenas" && "fala" in p.campos && dados) {
        const texto = dados.cenas.map((c) => (c.id === p.id ? String(p.campos.fala) : c.fala)).join("\n\n");
        await supabase.from("roteiros").update({ texto }).eq("id", roteiroId);
      }
    },
    onMutate: () => setAviso(null),
    onError: (e) => setAviso(e.message),
    onSettled: recarregar,
  });

  const reordenar = useMutation({
    mutationFn: async (cenas: Cena[]) => {
      // Duas passadas para não esbarrar no limite de ordem (1–20) durante a troca.
      for (const [i, c] of cenas.entries()) await supabase.from("roteiro_cenas").update({ ordem: 20 - i }).eq("id", c.id);
      for (const [i, c] of cenas.entries()) {
        const { error } = await supabase.from("roteiro_cenas").update({ ordem: i + 1 }).eq("id", c.id);
        if (error) throw new Error(error.message);
      }
    },
    onError: (e) => setAviso(e.message),
    onSettled: recarregar,
  });

  const incluir = useMutation({
    mutationFn: async () => {
      const ordem = (dados?.cenas.length ?? 0) + 1;
      const { error } = await supabase.from("roteiro_cenas").insert({ roteiro_id: roteiroId, conta_id: conta!.conta_id, ordem, fala: "Nova cena.", layout: "apresentador" });
      if (error) throw new Error(error.message);
    },
    onError: (e) => setAviso(e.message),
    onSettled: recarregar,
  });

  const apagar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("roteiro_cenas").delete().eq("id", id);
      if (error) throw new Error(error.message);
      const resto = (dados?.cenas ?? []).filter((c) => c.id !== id);
      await reordenar.mutateAsync(resto);
    },
    onError: (e) => setAviso(e.message),
    onSettled: recarregar,
  });

  if (carregando) return <section className="pagina-entra"><Card><LoaderCircle className="animate-spin" /></Card></section>;
  if (erro || !dados) return <section className="pagina-entra"><Card role="alert" className="text-red">{erro ?? "Roteiro não encontrado."}</Card></section>;

  const { roteiro, cenas } = dados;
  const total = cenas.reduce((s, c) => s + segundosDa(c.fala), 0);
  const fundos = new Set([...(roteiro.projeto_json.midias ?? []), ...cenas.map((c) => c.fundo_midia_id).filter(Boolean) as string[]]);
  const midia = (id: string | null) => (id ? midias.find((m) => m.id === id) : undefined);
  const mover = (i: number, d: -1 | 1) => {
    const lista = [...cenas];
    [lista[i], lista[i + d]] = [lista[i + d], lista[i]];
    reordenar.mutate(lista);
  };

  return (
    <section className="pagina-entra">
      <PageHeader titulo="Roteiro em cenas" subtitulo="A IA escreveu, você ajusta. Cada cena tem fala, layout e o que aparece ao fundo" icone={Clapperboard} cor="purple"
        acoes={
          <div className="flex gap-2">
            <Button variante="secundario" onClick={aoSair}><X /> Fechar</Button>
            <Button variante="destaque" disabled title="Chega na etapa 13.2">
              <Clapperboard /> Gerar avatar <Badge className="ml-1">13.2</Badge>
            </Button>
          </div>
        }
      />
      {aviso && <p role="alert" className="mb-4 text-foot text-red">{aviso}</p>}

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_2fr]">
        <Card>
          <Rotulo>Título</Rotulo>
          <input className="campo" maxLength={160} defaultValue={roteiro.titulo} disabled={demo}
            onBlur={(e) => e.target.value.trim() && e.target.value !== roteiro.titulo && salvar.mutate({ tabela: "roteiros", id: roteiro.id, campos: { titulo: e.target.value.trim() } })} />
          <Rotulo>Avatar e voz</Rotulo>
          <select aria-label="Avatar" className="campo" value={roteiro.avatar_id ?? ""} disabled={demo}
            onChange={(e) => salvar.mutate({ tabela: "roteiros", id: roteiro.id, campos: { avatar_id: e.target.value || null } })}>
            <option value="">{avatares.length ? "Escolha…" : "Nenhum cadastrado"}</option>
            {avatares.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
          <Rotulo>Legenda do post</Rotulo>
          <textarea className="campo min-h-36" maxLength={2200} defaultValue={roteiro.legenda ?? ""} disabled={demo}
            onBlur={(e) => e.target.value !== (roteiro.legenda ?? "") && salvar.mutate({ tabela: "roteiros", id: roteiro.id, campos: { legenda: e.target.value } })} />
          <p className="mt-4 text-foot text-label2">
            {cenas.length} cenas · cerca de <b className={cn(total > 90 ? "text-red" : "text-label")}>{total} s</b> de fala
            {roteiro.projeto_json.segundos ? ` (meta: ${roteiro.projeto_json.segundos} s)` : ""}
          </p>
          {total > 90 && <p className="mt-1 text-cap1 text-red">Passou de 90 s. Encurte as falas para caber no Reels montado.</p>}
        </Card>

        <Card>
          <ol className="grid gap-3">
            {cenas.map((c, i) => {
              const fundo = midia(c.fundo_midia_id);
              const travada = c.status === "gerando";
              return (
                <li key={c.id} className="grid gap-3 rounded-hig-lg bg-fill3 p-3 sm:grid-cols-[28px_1fr_190px]">
                  <span className="grid size-7 place-items-center rounded-full bg-purple text-cap1 font-bold text-white">{i + 1}</span>
                  <div>
                    <textarea aria-label={`Fala da cena ${i + 1}`} className="campo min-h-20" maxLength={600} defaultValue={c.fala} disabled={demo || travada}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== c.fala && salvar.mutate({ tabela: "roteiro_cenas", id: c.id, campos: { fala: e.target.value.trim() } })} />
                    <div className="mt-1 flex items-center gap-2 text-cap1 text-label2">
                      <span>≈ {segundosDa(c.fala)} s</span>
                      {c.status !== "rascunho" && <Badge tom={c.status === "pronto" ? "ok" : c.status === "erro" ? "aviso" : "neutro"}>{c.status}</Badge>}
                      <span className="ml-auto flex">
                        <Button tamanho="sm" variante="simples" aria-label="Subir" disabled={i === 0 || reordenar.isPending} onClick={() => mover(i, -1)}><ArrowUp /></Button>
                        <Button tamanho="sm" variante="simples" aria-label="Descer" disabled={i === cenas.length - 1 || reordenar.isPending} onClick={() => mover(i, 1)}><ArrowDown /></Button>
                        <Button tamanho="sm" variante="simples" aria-label="Apagar a cena" className="text-red" disabled={travada || cenas.length <= 1 || apagar.isPending}
                          onClick={() => apagar.mutate(c.id)}><Trash2 /></Button>
                      </span>
                    </div>
                  </div>
                  <div className="grid content-start gap-2">
                    <select aria-label={`Layout da cena ${i + 1}`} className="campo min-h-9 py-1 text-foot" value={c.layout} disabled={demo}
                      onChange={(e) => {
                        const layout = e.target.value as Layout;
                        salvar.mutate({ tabela: "roteiro_cenas", id: c.id, campos: layout === "apresentador" ? { layout, fundo_midia_id: null } : { layout } });
                      }}>
                      {LAYOUTS.map((l) => <option key={l.valor} value={l.valor}>{l.rotulo}</option>)}
                    </select>
                    {c.layout === "apresentador" ? (
                      <p className="text-cap1 text-label2">Cenário do look do avatar</p>
                    ) : (
                      <button type="button" onClick={() => setEscolhendoFundo(c.id)} disabled={demo}
                        className={cn("relative aspect-video overflow-hidden rounded-hig-lg bg-bg3 text-cap1 text-label2", !fundo && "border border-dashed border-orange text-orange")}>
                        {fundo?.url
                          ? (fundo.tipo === "video" ? <video src={fundo.url} muted className="size-full object-cover" /> : <img src={fundo.url} alt={fundo.nome} className="size-full object-cover" />)
                          : "Escolher a tela do sistema"}
                      </button>
                    )}
                  </div>
                  {c.erro && <p className="text-cap1 text-red sm:col-span-3">{c.erro}</p>}
                </li>
              );
            })}
          </ol>
          <Button variante="secundario" className="mt-3" onClick={() => incluir.mutate()} disabled={demo || cenas.length >= 10 || incluir.isPending}><Plus /> Cena</Button>
        </Card>
      </div>

      <SeletorMidia aberto={!!escolhendoFundo} tipos={["imagem", "video"]} titulo="Tela do sistema desta cena"
        onFechar={() => setEscolhendoFundo(null)}
        onEscolher={(m) => {
          const id = escolhendoFundo!;
          setEscolhendoFundo(null);
          salvar.mutate({ tabela: "roteiro_cenas", id, campos: { fundo_midia_id: m[0].id } });
          if (!fundos.has(m[0].id)) salvar.mutate({ tabela: "roteiros", id: roteiro.id, campos: { projeto_json: { ...roteiro.projeto_json, midias: [...fundos, m[0].id] } } });
        }} />
    </section>
  );
}
