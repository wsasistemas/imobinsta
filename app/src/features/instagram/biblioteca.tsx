import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Bookmark, Eye, Folder, Heart, Image as ImageIcon, Instagram, LibraryBig, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { botao } from "@/components/ui/button";
import { Badge, Card, Segmentado } from "@/components/ui/hig";
import { Pastas } from "@/components/ui/pastas";
import { contarPastas } from "@/lib/pastas";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { dataCurta, FORMATO_ROTULO, numero, tituloDoPost, usePosts, type Post, type StatusPost } from "./dados";

type Aba = "todos" | "rascunho" | "agendado" | "publicado";

const STATUS_BADGE: Record<StatusPost, { texto: string; tom: "ok" | "aviso" | "neutro" | "info" }> = {
  publicado: { texto: "Publicado", tom: "ok" },
  agendado: { texto: "Agendado", tom: "aviso" },
  publicando: { texto: "Publicando", tom: "info" },
  rascunho: { texto: "Rascunho", tom: "neutro" },
  erro: { texto: "Erro", tom: "aviso" },
};

/** Card 4:5 do post: capa do Instagram com a legenda e as métricas por cima. */
function CardPost({ post, pastas, onPasta }: { post: Post; pastas: string[]; onPasta: (pasta: string | null) => void }) {
  const [semCapa, setSemCapa] = useState(!post.capa_url);
  const titulo = tituloDoPost(post);
  const s = STATUS_BADGE[post.status];
  const conteudo = (
    <>
      {semCapa ? (
        <div className="absolute inset-0 flex flex-col bg-[linear-gradient(160deg,#0B2A6B,#0A58D6_60%,#05B4FF)] p-5">
          <span className="text-[11px] font-extrabold tracking-[0.04em] opacity-85">WSA SISTEMAS IA</span>
          <h3 className="mt-2 line-clamp-5 text-[20px] leading-[1.05] font-black uppercase">{titulo}</h3>
        </div>
      ) : (
        <img
          src={post.capa_url!}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setSemCapa(true)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      <Badge tom="instagram" className="absolute top-3 left-3 bg-black/55 text-white backdrop-blur">
        <Instagram /> {FORMATO_ROTULO[post.formato]}
      </Badge>
      <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(transparent,rgba(0,0,0,0.88))] p-4 pt-10">
        <b className="line-clamp-2 text-sub leading-snug">{titulo}</b>
        <small className="mt-1 block text-cap1 text-white/70">{dataCurta(post.publicado_em ?? post.agendado_para)}</small>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-cap1 text-white/85">
          <Badge tom={s.tom}>{s.texto}</Badge>
          {post.status === "publicado" && (
            <>
              <span className="inline-flex items-center gap-1" title="Alcance"><Eye className="size-3.5" />{numero(post.alcance)}</span>
              <span className="inline-flex items-center gap-1" title="Curtidas"><Heart className="size-3.5" />{numero(post.curtidas)}</span>
              <span className="inline-flex items-center gap-1" title="Salvamentos"><Bookmark className="size-3.5" />{numero(post.salvamentos)}</span>
            </>
          )}
        </div>
      </div>
    </>
  );
  const classe =
    "relative block aspect-[4/5] overflow-hidden rounded-hig-xl bg-bg3 text-white shadow-hig transition-transform duration-200 ease-apple hover:-translate-y-0.5";
  return (
    <div>
      {post.permalink ? (
        <a href={post.permalink} target="_blank" rel="noreferrer" className={classe} aria-label={`${titulo} — abrir no Instagram`}>
          {conteudo}
        </a>
      ) : (
        <div className={classe}>{conteudo}</div>
      )}
      <label className="mt-2 flex items-center gap-1.5 text-cap1 text-label2">
        <Folder className="size-3.5 flex-none" aria-hidden />
        <select
          value={post.pasta ?? ""}
          onChange={(e) => onPasta(e.target.value || null)}
          aria-label={`Pasta de ${titulo}`}
          className="min-h-8 min-w-0 flex-1 rounded-hig-sm bg-fill3 px-2 text-cap1 text-label"
        >
          <option value="">Sem pasta</option>
          {pastas.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
    </div>
  );
}

export function Biblioteca() {
  const { data: posts = [], isLoading, error } = usePosts();
  const [aba, setAba] = useState<Aba>("todos");
  const [busca, setBusca] = useState("");
  const [pasta, setPasta] = useState<string | null>(null);
  const [pastasNovas, setPastasNovas] = useState<string[]>([]);
  const cliente = useQueryClient();
  const mudarPasta = useMutation({
    mutationFn: async ({ id, pasta }: { id: string; pasta: string | null }) => {
      const { error } = await supabase.from("posts").update({ pasta }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => cliente.invalidateQueries({ queryKey: ["posts"] }),
  });
  const pastas = contarPastas(posts, pastasNovas);

  const contagem = useMemo(() => {
    const c = { todos: posts.length, rascunho: 0, agendado: 0, publicado: 0 };
    for (const p of posts) if (p.status in c) c[p.status as Exclude<Aba, "todos">]++;
    return c;
  }, [posts]);

  const termo = busca.trim().toLowerCase();
  const lista = posts.filter(
    (p) =>
      (aba === "todos" || p.status === aba) &&
      (pasta === null || p.pasta === pasta) &&
      (!termo || (p.legenda ?? "").toLowerCase().includes(termo)),
  );

  const rotulo = (texto: string, n: number) => (
    <>
      {texto}
      <span className="ml-1.5 font-normal text-label2">{n}</span>
    </>
  );

  return (
    <section className="pagina-entra">
      <PageHeader
        titulo="Biblioteca"
        subtitulo={isLoading ? "Carregando…" : `${posts.length} posts encontrados`}
        icone={LibraryBig}
        cor="orange"
        acoes={
          <>
            <Link to="/midias" className={botao({ variante: "secundario" })}><ImageIcon /> Banco de mídias</Link>
            <Link to="/criar" className={botao()}><Plus /> Novo post</Link>
          </>
        }
      />

      <Segmentado<Aba>
        rotulo="Filtrar por situação"
        valor={aba}
        onChange={setAba}
        className="mb-6 max-w-full overflow-x-auto"
        opcoes={[
          { valor: "todos", rotulo: rotulo("Todos", contagem.todos) },
          { valor: "rascunho", rotulo: rotulo("Rascunhos", contagem.rascunho) },
          { valor: "agendado", rotulo: rotulo("Agendados", contagem.agendado) },
          { valor: "publicado", rotulo: rotulo("Publicados", contagem.publicado) },
        ]}
      />

      <label className="mb-6 flex min-h-11 items-center gap-2 rounded-hig-md bg-fill3 px-3">
        <Search className="size-[18px] text-label2" aria-hidden />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar na legenda…"
          aria-label="Buscar posts"
          className="min-w-0 flex-1 bg-transparent text-sub outline-none placeholder:text-label3"
        />
      </label>

      <Pastas
        pastas={pastas}
        valor={pasta}
        onChange={setPasta}
        onNova={(n) => setPastasNovas((l) => (l.includes(n) ? l : [...l, n]))}
      />

      {(error || mudarPasta.error) && (
        <Card className="mb-6 text-red">Não foi possível {error ? "carregar os posts" : "mudar a pasta"}. Atualize a página.</Card>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4" aria-busy={isLoading}>
        {isLoading
          ? Array.from({ length: 8 }, (_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-hig-xl bg-bg2" />)
          : lista.map((p) => (
              <CardPost
                key={p.id}
                post={p}
                pastas={pastas.map((x) => x.nome)}
                onPasta={(nova) => mudarPasta.mutate({ id: p.id, pasta: nova })}
              />
            ))}
      </div>

      {!isLoading && !error && lista.length === 0 && (
        <Card className="text-center text-label2">
          {posts.length === 0 ? (
            <>
              Nenhum post ainda. Em <Link to="/conexoes" className="text-blue">Conexões e custos</Link>, clique em
              Sincronizar agora para trazer os posts do Instagram.
            </>
          ) : (
            "Nenhum post nesta aba com essa busca."
          )}
        </Card>
      )}

      <p className={cn("mt-4 text-foot text-label2", isLoading && "invisible")}>
        Os publicados vêm do Instagram pela API oficial. Clique num post para abri-lo no Instagram.
      </p>
    </section>
  );
}
