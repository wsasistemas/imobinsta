import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, LoaderCircle, Plus, Sparkles, Trash2, WandSparkles, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/hig";
import { useAcesso } from "@/features/auth/acesso";
import { PRODUTOS } from "@/features/criar/esquema";
import { tituloDoPost, usePosts, type Post } from "@/features/instagram/dados";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { chaveDia, diaLocal, FORMATO_PAUTA, type FormatoPauta, type Pauta, usePautas } from "./dados";

const SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

type Evento = {
  chave: string;
  dia: string;
  tipo: "ia" | "pauta" | "criacao" | "agendado" | "publicado" | "reels";
  texto: string;
  hora?: string;
  pauta?: Pauta;
  post?: Post;
};

const ESTILO: Record<Evento["tipo"], string> = {
  ia: "bg-tint text-blue border-blue",
  pauta: "bg-fill3 text-label border-label3",
  criacao: "bg-tint text-blue border-blue",
  agendado: "bg-orange/15 text-orange border-orange",
  publicado: "bg-pink/15 text-pink border-pink",
  reels: "bg-purple/15 text-purple border-purple",
};

type Form = { id?: string; data: string; titulo: string; produto: string; formato: FormatoPauta; notas: string; post_id: string | null };

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Monta as semanas (domingo a sábado) que cobrem o mês. */
function semanasDo(mes: Date) {
  const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1);
  inicio.setDate(1 - inicio.getDay());
  const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
  const dias: Date[] = [];
  for (const d = new Date(inicio); d <= ultimo || d.getDay() !== 0; d.setDate(d.getDate() + 1)) dias.push(new Date(d));
  return Array.from({ length: dias.length / 7 }, (_, i) => dias.slice(i * 7, i * 7 + 7));
}

function eventosDe(pautas: Pauta[], posts: Post[]): Evento[] {
  const ligados = new Set(pautas.map((p) => p.post_id).filter(Boolean));
  const evs: Evento[] = pautas.map((p) => {
    const status = p.posts?.status;
    const tipo: Evento["tipo"] =
      status === "publicado" ? "publicado"
      : status === "agendado" || status === "publicando" ? "agendado"
      : p.post_id ? "criacao"
      : p.formato === "reels" ? "reels"
      : p.origem === "ia" ? "ia" : "pauta";
    const sufixo = tipo === "criacao" ? " · em criação" : "";
    return { chave: `p-${p.id}`, dia: p.data, tipo, texto: `${p.origem === "ia" && !p.post_id ? "💡 " : ""}${p.titulo}${sufixo}`, pauta: p };
  });
  for (const post of posts) {
    if (ligados.has(post.id)) continue;
    const quando = post.status === "agendado" ? post.agendado_para : post.status === "publicado" ? post.publicado_em : null;
    if (!quando) continue;
    evs.push({
      chave: `s-${post.id}`, dia: chaveDia(new Date(quando)), tipo: post.status === "agendado" ? "agendado" : post.formato === "reels" ? "reels" : "publicado",
      texto: tituloDoPost(post), hora: hora(quando), post,
    });
  }
  return evs;
}

export function Calendario() {
  const { conta, demo } = useAcesso();
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const [mes, setMes] = useState(() => { const h = new Date(); return new Date(h.getFullYear(), h.getMonth(), 1); });
  const [form, setForm] = useState<Form | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const semanas = semanasDo(mes);
  const inicio = chaveDia(semanas[0][0]);
  const fim = chaveDia(semanas.at(-1)![6]);
  const pautas = usePautas(inicio, fim);
  const posts = usePosts();
  const eventos = eventosDe(pautas.data ?? [], posts.data ?? []);
  const doDia = (k: string) => eventos.filter((e) => e.dia === k).sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? ""));
  const hoje = chaveDia(new Date());
  const doMes = eventos.filter((e) => diaLocal(e.dia).getMonth() === mes.getMonth());
  const conta_ = (t: Evento["tipo"][]) => doMes.filter((e) => t.includes(e.tipo)).length;

  const salvar = useMutation({
    mutationFn: async (f: Form) => {
      const campos = { data: f.data, titulo: f.titulo.trim(), produto: f.produto || null, formato: f.formato, notas: f.notas.trim() || null };
      const { error } = f.id
        ? await supabase.from("pautas").update(campos).eq("id", f.id)
        : await supabase.from("pautas").insert({ ...campos, conta_id: conta!.conta_id, origem: "manual" });
      if (error) throw new Error(error.message);
    },
    onMutate: () => setErro(null),
    onSuccess: () => setForm(null),
    onError: (e) => setErro(e.message),
    onSettled: () => cliente.invalidateQueries({ queryKey: ["pautas"] }),
  });

  const apagar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pautas").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => setForm(null),
    onError: (e) => setErro(e.message),
    onSettled: () => cliente.invalidateQueries({ queryKey: ["pautas"] }),
  });

  function abrir(e: Evento) {
    if (e.pauta) {
      const p = e.pauta;
      setErro(null);
      setForm({ id: p.id, data: p.data, titulo: p.titulo, produto: p.produto ?? "", formato: p.formato, notas: p.notas ?? "", post_id: p.post_id });
      return;
    }
    if (e.post?.status === "publicado" && e.post.permalink) window.open(e.post.permalink, "_blank", "noopener");
    else if (e.post) navegar(`/criar/publicar/${e.post.id}`);
  }

  const nova = (dia: string) => { setErro(null); setForm({ data: dia, titulo: "", produto: "", formato: "carrossel", notas: "", post_id: null }); };
  const mudarMes = (n: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1));
  const nomeMes = mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <section className="pagina-entra">
      <PageHeader
        titulo="Calendário editorial"
        subtitulo="Planeje, vincule e agende seus conteúdos"
        icone={CalendarDays}
        cor="red"
        acoes={
          <>
            <div className="flex items-center rounded-full bg-fill3">
              <Button variante="simples" tamanho="sm" aria-label="Mês anterior" onClick={() => mudarMes(-1)}><ChevronLeft /></Button>
              <span className="min-w-32 text-center text-foot font-semibold first-letter:uppercase">{nomeMes}</span>
              <Button variante="simples" tamanho="sm" aria-label="Próximo mês" onClick={() => mudarMes(1)}><ChevronRight /></Button>
            </div>
            <Button onClick={() => nova(diaLocal(hoje).getMonth() === mes.getMonth() ? hoje : chaveDia(mes))} disabled={demo}><Plus /> Nova pauta</Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-foot text-label2">
        <span className="inline-flex items-center gap-1.5"><Sparkles className="size-4" aria-hidden /> {conta_(["ia"])} ideias IA</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-label3" /> {conta_(["pauta", "reels"])} pautas</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-blue" /> {conta_(["criacao"])} em criação</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-orange" /> {conta_(["agendado"])} agendados</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-pink" /> {conta_(["publicado"])} publicados</span>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-4 rounded-hig-xl bg-gradient-to-r from-blue to-indigo p-5 text-white">
        <span className="grid size-11 place-items-center rounded-hig-lg bg-white/20"><Sparkles /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-t3 font-semibold">Recomendações IA</h2>
          <p className="mt-1 text-foot opacity-90">2 posts por semana nas próximas 4 semanas, alternando produto e formato, a partir dos posts que mais alcançaram.</p>
        </div>
        <span className="rounded-full bg-white/20 px-3 py-1.5 text-foot font-semibold" title="Etapa 6.2: usa o Gemini">Em breve</span>
      </div>

      {demo && <Card className="mb-5 text-label2">Modo demonstração: pautas e posts reais não aparecem aqui.</Card>}
      {(pautas.error || posts.error) && <Card role="alert" className="mb-5 text-red">Não foi possível carregar o calendário: {(pautas.error ?? posts.error)!.message}</Card>}

      {form && (
        <Card className="mb-5">
          <form onSubmit={(e) => { e.preventDefault(); salvar.mutate(form); }}>
            <div className="flex items-center gap-3">
              <h2 className="text-t3 font-semibold">{form.id ? "Pauta" : "Nova pauta"}</h2>
              <Button type="button" variante="simples" tamanho="sm" className="ml-auto" aria-label="Fechar" onClick={() => setForm(null)}><X /></Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[120px_1fr] sm:items-center">
              <label htmlFor="pt-titulo" className="text-foot text-label2">Título</label>
              <input id="pt-titulo" className="campo" required maxLength={200} value={form.titulo} autoFocus
                placeholder="Ex.: Carrossel sobre aprovações no celular" onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
              <label htmlFor="pt-data" className="text-foot text-label2">Dia</label>
              <input id="pt-data" type="date" className="campo max-w-52" required value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              <label htmlFor="pt-formato" className="text-foot text-label2">Formato</label>
              <select id="pt-formato" className="campo max-w-52" value={form.formato} onChange={(e) => setForm({ ...form, formato: e.target.value as FormatoPauta })}>
                {(Object.keys(FORMATO_PAUTA) as FormatoPauta[]).map((f) => <option key={f} value={f}>{FORMATO_PAUTA[f]}</option>)}
              </select>
              <label htmlFor="pt-produto" className="text-foot text-label2">Produto</label>
              <select id="pt-produto" className="campo max-w-72" value={form.produto} onChange={(e) => setForm({ ...form, produto: e.target.value })}>
                <option value="">—</option>
                {PRODUTOS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <label htmlFor="pt-notas" className="text-foot text-label2 sm:self-start sm:pt-3">Notas</label>
              <textarea id="pt-notas" className="campo min-h-20" maxLength={2000} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
            {erro && <p role="alert" className="mt-3 text-foot text-red">{erro}</p>}
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="submit" disabled={salvar.isPending || !form.titulo.trim()}>{salvar.isPending && <LoaderCircle className="animate-spin" />} Salvar</Button>
              {form.id && !form.post_id && form.formato !== "reels" && (
                <Button type="button" variante="secundario" onClick={() => navegar(`/criar/imagem?pauta=${form.id}`)}><WandSparkles /> Criar post</Button>
              )}
              {form.id && !form.post_id && form.formato === "reels" && <span className="self-center text-cap1 text-label2">Reels chega nas Fases 7 e 8.</span>}
              {form.post_id && (
                <Button type="button" variante="secundario" onClick={() => navegar(`/criar/publicar/${form.post_id}`)}>Abrir post</Button>
              )}
              {form.id && (
                <Button type="button" variante="simples" className="ml-auto text-red" disabled={apagar.isPending} onClick={() => apagar.mutate(form.id!)}><Trash2 /> Apagar</Button>
              )}
            </div>
          </form>
        </Card>
      )}

      {/* Grade do mês (tablet e computador) */}
      <div className="hidden overflow-hidden rounded-hig-xl bg-bg2 shadow-hig sm:block" aria-busy={pautas.isLoading || posts.isLoading}>
        <div className="grid grid-cols-7 border-b border-sep">
          {SEMANA.map((d) => <div key={d} className="py-3 text-center text-cap1 font-semibold tracking-[0.04em] text-label2">{d}</div>)}
        </div>
        {semanas.map((s) => (
          <div key={chaveDia(s[0])} className="grid grid-cols-7">
            {s.map((d) => {
              const k = chaveDia(d);
              const fora = d.getMonth() !== mes.getMonth();
              return (
                <div key={k} className="group min-h-31 min-w-0 border-r border-b border-sep px-2 py-2 last:border-r-0">
                  <div className="flex items-center">
                    <span className={cn("grid size-7 place-items-center rounded-full text-sub font-medium", fora && "text-label3", k === hoje && "bg-red font-semibold text-white")}>{d.getDate()}</span>
                    {!demo && (
                      <button type="button" aria-label={`Nova pauta em ${d.toLocaleDateString("pt-BR")}`} onClick={() => nova(k)}
                        className="ml-auto grid size-6 place-items-center rounded-full text-label2 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-fill3">
                        <Plus className="size-4" />
                      </button>
                    )}
                  </div>
                  {doDia(k).map((e) => (
                    <button key={e.chave} type="button" onClick={() => abrir(e)} title={e.texto}
                      className={cn("mt-1.5 block w-full truncate rounded-md border-l-3 px-2 py-1 text-left text-cap1 font-semibold", ESTILO[e.tipo])}>
                      {e.hora && `${e.hora} · `}{e.texto}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Agenda (celular) */}
      <Card className="sm:hidden">
        {!doMes.length && <p className="text-foot text-label2">Nada neste mês ainda.</p>}
        <ol className="grid gap-4">
          {[...new Set(doMes.map((e) => e.dia))].sort().map((k) => (
            <li key={k}>
              <p className={cn("text-cap1 font-semibold uppercase text-label2", k === hoje && "text-red")}>
                {diaLocal(k).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
              </p>
              {doDia(k).map((e) => (
                <button key={e.chave} type="button" onClick={() => abrir(e)}
                  className={cn("mt-1.5 block w-full rounded-md border-l-3 px-3 py-2 text-left text-foot font-semibold", ESTILO[e.tipo])}>
                  {e.hora && `${e.hora} · `}{e.texto}
                </button>
              ))}
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}
