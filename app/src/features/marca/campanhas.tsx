import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, LoaderCircle, Megaphone, Sparkles, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/hig";
import { useAcesso } from "@/features/auth/acesso";
import { chaveDia } from "@/features/calendario/dados";
import { Nota } from "@/features/criar/comum";
import { chamarFuncao } from "@/features/criar/dados";
import { supabase } from "@/lib/supabase";
import { useDna } from "./dados";

type Campanha = {
  id: string; nome: string; objetivo: "engajar" | "seguidores" | "vender"; publico: string | null; descricao: string | null;
  semanas: number; status: "sugerida" | "aprovada" | "descartada"; inicio: string | null; fim: string | null; criado_em: string;
  posts_json: { titulo: string; formato: "post" | "carrossel" | "reels"; produto: string; notas: string }[];
};

const OBJETIVO: Record<Campanha["objetivo"], { texto: string; tom: "aviso" | "ok" | "neutro" }> = {
  vender: { texto: "Vender", tom: "aviso" }, seguidores: { texto: "Seguidores", tom: "ok" }, engajar: { texto: "Engajar", tom: "neutro" },
};
const FORMATO: Record<string, string> = { post: "Post", carrossel: "Carrossel", reels: "Reels" };

/** Próxima segunda-feira no fuso do navegador (AAAA-MM-DD). */
function proximaSegunda() {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return chaveDia(d);
}
const ehSegunda = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T12:00:00`).getDay() === 1;

/** Campanhas sugeridas (Fase 10): a IA propõe a partir do DNA + ranking; aprovar cria as pautas no Calendário. */
export function Campanhas() {
  const { conta, demo } = useAcesso();
  const cliente = useQueryClient();
  const dna = useDna();
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);

  const campanhas = useQuery({
    queryKey: ["campanhas", conta?.conta_id],
    enabled: !!conta && !demo,
    queryFn: async () => {
      const { data, error } = await supabase.from("campanhas")
        .select("id, nome, objetivo, publico, descricao, semanas, status, inicio, fim, criado_em, posts_json")
        .eq("conta_id", conta!.conta_id).neq("status", "descartada").order("criado_em", { ascending: false }).limit(30);
      if (error) throw error;
      return data as Campanha[];
    },
  });
  const atualizar = () => cliente.invalidateQueries({ queryKey: ["campanhas"] });

  const sugerir = useMutation({
    mutationFn: () => chamarFuncao<{ criadas: number; com_ranking: number }>("ia-texto", { acao: "campanhas", conta_id: conta!.conta_id }),
    onMutate: () => setAviso(null),
    onSuccess: (r) => setAviso({ tom: "ok", texto: `${r.criadas} campanhas sugeridas${r.com_ranking ? `, com base nos ${r.com_ranking} posts de maior alcance` : " (sem métricas de alcance ainda)"}.` }),
    onError: (e) => setAviso({ tom: "erro", texto: e.message }),
    onSettled: atualizar,
  });

  const sugeridas = (campanhas.data ?? []).filter((c) => c.status === "sugerida");
  const aprovadas = (campanhas.data ?? []).filter((c) => c.status === "aprovada");

  return (
    <section className="pagina-entra">
      <PageHeader
        titulo="Campanhas"
        subtitulo="Sugeridas a partir do DNA da marca e dos posts que mais alcançaram"
        icone={Megaphone}
        cor="orange"
        acoes={<Button onClick={() => sugerir.mutate()} disabled={demo || sugerir.isPending}>
          {sugerir.isPending ? <LoaderCircle className="animate-spin" /> : <Sparkles />} {sugerir.isPending ? "Pensando… (até 1 min)" : "Sugerir campanhas"}
        </Button>}
      />
      {demo && <Nota className="mb-5">Modo demonstração: as campanhas não são geradas aqui.</Nota>}
      {!dna.isLoading && !dna.data && !demo && (
        <Nota className="mb-5">Sem DNA da marca, as campanhas saem genéricas. <Link to="/marca" className="text-blue">Leia o seu site primeiro</Link>.</Nota>
      )}
      {aviso && (
        <div role={aviso.tom === "erro" ? "alert" : "status"} className={`mb-5 rounded-hig-lg px-4 py-3 text-foot ${aviso.tom === "erro" ? "bg-red/10 text-red" : "bg-green/10 text-green"}`}>{aviso.texto}</div>
      )}
      {campanhas.error && <Card role="alert" className="mb-5 text-red">{campanhas.error.message}</Card>}
      {campanhas.isLoading && !demo && <p className="flex items-center gap-2 text-foot text-label2"><LoaderCircle className="size-4 animate-spin" /> Carregando…</p>}

      {!!sugeridas.length && <h2 className="mb-3">Sugeridas</h2>}
      <div className="grid gap-4 lg:grid-cols-3">
        {sugeridas.map((c) => <CartaoCampanha key={c.id} c={c} contaId={conta!.conta_id} aoMudar={atualizar} aoAviso={setAviso} />)}
      </div>
      {!campanhas.isLoading && !sugeridas.length && !aprovadas.length && !demo && (
        <Card className="text-label2">Nenhuma campanha ainda. Clique em <b>Sugerir campanhas</b>.</Card>
      )}

      {!!aprovadas.length && (
        <Card className="mt-6">
          <h2>Aprovadas</h2>
          <ul className="mt-3 grid gap-2">
            {aprovadas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 border-t border-sep pt-2 text-foot">
                <Badge tom={OBJETIVO[c.objetivo].tom}>{OBJETIVO[c.objetivo].texto}</Badge>
                <b>{c.nome}</b>
                <span className="text-label2">{c.posts_json.length} posts · {c.inicio && new Date(`${c.inicio}T12:00:00`).toLocaleDateString("pt-BR")} a {c.fim && new Date(`${c.fim}T12:00:00`).toLocaleDateString("pt-BR")}</span>
                <Link to="/calendario" className="ml-auto inline-flex items-center gap-1 text-blue"><CalendarCheck className="size-4" /> Ver no Calendário</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function CartaoCampanha({ c, contaId, aoMudar, aoAviso }: {
  c: Campanha; contaId: string; aoMudar: () => void; aoAviso: (a: { tom: "ok" | "erro"; texto: string } | null) => void;
}) {
  const [aprovando, setAprovando] = useState(false);
  const [inicio, setInicio] = useState(proximaSegunda);
  const aprovar = useMutation({
    mutationFn: () => chamarFuncao<{ pautas: number; inicio: string; fim: string }>("ia-texto", { acao: "aprovar_campanha", conta_id: contaId, campanha_id: c.id, inicio }),
    onSuccess: (r) => aoAviso({ tom: "ok", texto: `"${c.nome}" aprovada: ${r.pautas} pautas no Calendário. Cada uma abre o post já preenchido.` }),
    onError: (e) => aoAviso({ tom: "erro", texto: e.message }),
    onSettled: aoMudar,
  });
  const descartar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("campanhas").update({ status: "descartada" }).eq("id", c.id);
      if (error) throw new Error(error.message);
    },
    onSettled: aoMudar,
  });
  return (
    <Card className="flex flex-col">
      <div className="flex items-center gap-2"><Badge tom={OBJETIVO[c.objetivo].tom}>{OBJETIVO[c.objetivo].texto}</Badge>
        <span className="ml-auto text-cap1 text-label2">{c.semanas} semanas · {c.posts_json.length} posts</span></div>
      <h3 className="mt-3">{c.nome}</h3>
      {c.publico && <p className="mt-1 text-foot text-label2">Para: {c.publico}</p>}
      {c.descricao && <p className="mt-2 text-foot">{c.descricao}</p>}
      <ol className="mt-3 grid gap-2 text-foot">
        {c.posts_json.map((p, i) => (
          <li key={i} className="rounded-hig-lg bg-fill3 px-3 py-2">
            <b>{FORMATO[p.formato] ?? p.formato}</b> · {p.titulo}
            <span className="block text-cap1 text-label2">{p.produto}{p.notas ? ` — ${p.notas}` : ""}</span>
          </li>
        ))}
      </ol>
      <div className="mt-auto pt-4">
        {aprovando ? (
          <div className="grid gap-2 rounded-hig-lg bg-fill3 p-3">
            <label className="text-foot text-label2" htmlFor={`ini-${c.id}`}>Começar na segunda-feira</label>
            <input id={`ini-${c.id}`} type="date" className="campo" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            {!ehSegunda(inicio) && <span className="text-cap1 text-orange">Escolha uma segunda-feira.</span>}
            <div className="flex gap-2">
              <Button tamanho="sm" onClick={() => aprovar.mutate()} disabled={!ehSegunda(inicio) || aprovar.isPending}>
                {aprovar.isPending ? <LoaderCircle className="animate-spin" /> : <CalendarCheck />} Criar pautas
              </Button>
              <Button tamanho="sm" variante="simples" onClick={() => setAprovando(false)}><X /> Cancelar</Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button tamanho="sm" onClick={() => setAprovando(true)}>Aprovar → Calendário</Button>
            <Button tamanho="sm" variante="simples" className="text-red" disabled={descartar.isPending} onClick={() => descartar.mutate()}><Trash2 /> Descartar</Button>
          </div>
        )}
      </div>
    </Card>
  );
}
