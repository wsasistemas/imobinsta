import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Clapperboard, Download, ImagePlus, LoaderCircle, Megaphone, Music, Pause, Play, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, Segmentado, Toggle } from "@/components/ui/hig";
import { useAcesso } from "@/features/auth/acesso";
import { coresDaMarca, useDna } from "@/features/marca/dados";
import { useMidias } from "@/features/midias/dados";
import { enviarParaBanco } from "@/features/midias/envio";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Nota, Rotulo } from "./comum";
import { PRODUTOS } from "./esquema";
import { baixar } from "./render";
import { type MidiaEscolhida, SeletorMidia } from "./seletor-midia";
import {
  ALTURA_V, type Cena, LARGURA_V, MAX_CENAS, MAX_SEGUNDOS, type Projeto, Recursos, cenaDeCta, cenaDeMidia, cenaNoTempo, desenharQuadro,
  duracaoDa, duracaoTotal, gerarMp4, suporte,
} from "./video";

type Escolha = "cenas" | "trocar" | "trilha" | "logo";
const VAZIO: Projeto = { cenas: [], trilha: null, logo: null, transicao: "corte", legendaGrande: true, cor: "#0A4FD6" };
const chaveRascunho = (conta: string) => `imobinsta-reels-${conta}`;

function lerRascunho(conta: string | undefined): Projeto {
  if (!conta) return VAZIO;
  try {
    const salvo = localStorage.getItem(chaveRascunho(conta));
    return salvo ? { ...VAZIO, ...(JSON.parse(salvo) as Projeto) } : VAZIO;
  } catch {
    return VAZIO;
  }
}

const seg = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Reels montado no navegador (Fase 12.2): fotos com movimento, trechos de vídeo e cena de CTA, com texto por cena,
 * trilha e logo. O MP4 sai no próprio navegador, vai para o Banco (pasta Reels) e segue para o Publicar.
 */
export function Reels() {
  const { conta, demo } = useAcesso();
  const contaId = conta?.conta_id;
  const navegar = useNavigate();
  const { data: midias = [] } = useMidias();
  const { data: dna } = useDna();
  const cor = coresDaMarca(dna).principal;

  const [projeto, setProjeto] = useState<Projeto>(() => lerRascunho(contaId));
  const [sel, setSel] = useState(0);
  const [tempo, setTempo] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const [produto, setProduto] = useState<string>(PRODUTOS[0]);
  const [pode, setPode] = useState<{ video: boolean; audio: boolean } | null>(null);
  const [falhaMidia, setFalhaMidia] = useState<string | null>(null);
  const [progresso, setProgresso] = useState(0);
  const [resultado, setResultado] = useState<{ blob: Blob; url: string } | null>(null);

  const canvas = useRef<HTMLCanvasElement>(null);
  const recursos = useRef(new Recursos());
  const cancelado = useRef(false);
  const comCor = useMemo(() => ({ ...projeto, cor }), [projeto, cor]);
  const atualRef = useRef(comCor);
  atualRef.current = comCor;
  const total = duracaoTotal(projeto);
  const cena = projeto.cenas[sel] as Cena | undefined;
  const urls = useMemo(() => new Map(midias.map((m) => [m.storage_path, m.url])), [midias]);

  useEffect(() => {
    suporte().then(setPode);
    const r = recursos.current;
    return () => r.liberar();
  }, []);

  // Rascunho local da montagem (some se o navegador limpar os dados; o resultado de verdade é o MP4 no Banco).
  useEffect(() => {
    if (!contaId) return;
    try {
      localStorage.setItem(chaveRascunho(contaId), JSON.stringify(projeto));
    } catch {
      /* armazenamento indisponível */
    }
  }, [projeto, contaId]);

  // Prévia: desenha o quadro pedido; pedidos que chegam durante um desenho ficam só com o último.
  const alvo = useRef<number | null>(null);
  const ocupado = useRef(false);
  function pedirQuadro(t: number) {
    alvo.current = t;
    if (ocupado.current) return;
    ocupado.current = true;
    (async () => {
      try {
        while (alvo.current !== null) {
          const agora = alvo.current;
          alvo.current = null;
          const ctx = canvas.current?.getContext("2d", { alpha: false });
          if (!ctx) break;
          try {
            await recursos.current.carregar(atualRef.current);
            setFalhaMidia(null);
          } catch (e) {
            setFalhaMidia((e as Error).message);
          }
          await desenharQuadro(ctx, atualRef.current, recursos.current, agora);
        }
      } finally {
        ocupado.current = false;
      }
    })();
  }

  useEffect(() => {
    pedirQuadro(Math.min(tempo, Math.max(0, total - 0.01)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tempo, comCor]);

  useEffect(() => {
    if (!tocando) return;
    const inicio = performance.now() - tempo * 1000;
    let quadro = 0;
    const passo = () => {
      const t = (performance.now() - inicio) / 1000;
      if (t >= total) {
        setTempo(total);
        setTocando(false);
        return;
      }
      setTempo(t);
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocando]);

  function inicioDa(i: number) {
    return projeto.cenas.slice(0, i).reduce((s, c) => s + duracaoDa(c), 0);
  }

  function selecionar(i: number) {
    setSel(i);
    setTocando(false);
    setTempo(inicioDa(i) + Math.min(0.5, duracaoDa(projeto.cenas[i]) / 2));
  }

  function mudar(p: Partial<Projeto>) {
    setResultado(null);
    setProjeto((x) => ({ ...x, ...p }));
  }

  function mudarCena(p: Partial<Cena>) {
    mudar({ cenas: projeto.cenas.map((c, i) => (i === sel ? { ...c, ...p } : c)) });
  }

  function mover(d: -1 | 1) {
    const j = sel + d;
    if (j < 0 || j >= projeto.cenas.length) return;
    const cenas = [...projeto.cenas];
    [cenas[sel], cenas[j]] = [cenas[j], cenas[sel]];
    mudar({ cenas });
    setSel(j);
  }

  function remover() {
    mudar({ cenas: projeto.cenas.filter((_, i) => i !== sel) });
    setSel(Math.max(0, sel - 1));
  }

  function escolher(m: MidiaEscolhida[]) {
    const tipo = escolha;
    setEscolha(null);
    if (tipo === "trilha") return mudar({ trilha: { storage_path: m[0].storage_path, nome: m[0].nome } });
    if (tipo === "logo") return mudar({ logo: m[0].storage_path });
    if (tipo === "trocar" && cena) {
      const nova = cenaDeMidia(m[0]);
      return mudarCena({ tipo: nova.tipo, midia: nova.midia, inicio: nova.inicio, fim: nova.fim });
    }
    const novas = m.slice(0, MAX_CENAS - projeto.cenas.length).map(cenaDeMidia);
    mudar({ cenas: [...projeto.cenas, ...novas] });
    setSel(projeto.cenas.length);
  }

  const gerar = useMutation({
    mutationFn: async () => {
      cancelado.current = false;
      setTocando(false);
      setProgresso(0);
      const blob = await gerarMp4(atualRef.current, recursos.current, {
        audio: !!pode?.audio, aoAvancar: setProgresso, cancelado: () => cancelado.current,
      });
      return { blob, url: URL.createObjectURL(blob) };
    },
    onSuccess: (r) => setResultado((antigo) => {
      if (antigo) URL.revokeObjectURL(antigo.url);
      return r;
    }),
  });

  const publicar = useMutation({
    mutationFn: async () => {
      const data = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      const arquivo = new File([resultado!.blob], `reels-${data}.mp4`, { type: "video/mp4" });
      const midia = await enviarParaBanco({ contaId: contaId!, arquivo, pasta: "Reels", onProgresso: setProgresso });
      const legenda = projeto.cenas.map((c) => c.texto.trim()).filter(Boolean).join("\n\n");
      const { data: post, error } = await supabase.from("posts").insert({
        conta_id: contaId, formato: "reels", status: "rascunho", objetivo: "vender", produto, origem: "zero", prompt: null,
        legenda, criar_automacao: true, video_midia_id: midia.id, pasta: produto,
      }).select("id").single();
      if (error) throw new Error(error.message);
      try {
        localStorage.removeItem(chaveRascunho(contaId!));
      } catch {
        /* armazenamento indisponível */
      }
      return post.id as string;
    },
    onSuccess: (id) => navegar(`/criar/publicar/${id}`),
  });

  const longo = total > MAX_SEGUNDOS;
  const semMidia = projeto.cenas.some((c) => c.tipo !== "cta" && !c.midia);
  const ocupadoGerar = gerar.isPending || publicar.isPending;
  const podeGerar = !!pode?.video && projeto.cenas.length > 0 && !longo && !semMidia && !demo && !ocupadoGerar;
  const atual = cenaNoTempo(projeto, tempo);

  return (
    <section className="pagina-entra">
      <PageHeader
        titulo="Reels / vídeo"
        subtitulo="Monte com suas fotos e vídeos · o MP4 é gerado no seu navegador"
        icone={Clapperboard}
        cor="blue"
        acoes={
          <Button onClick={() => gerar.mutate()} disabled={!podeGerar}>
            {gerar.isPending ? <LoaderCircle className="animate-spin" /> : <Clapperboard />} {gerar.isPending ? "Gerando…" : "Gerar MP4"}
          </Button>
        }
      />
      {demo && <Nota className="mb-5">Modo demonstração: o Banco de mídias não é carregado.</Nota>}
      {pode && !pode.video && (
        <Nota className="mb-5">Este navegador não gera vídeo. Abra o Estúdio no Chrome ou no Edge (computador) para montar o Reels.</Nota>
      )}
      {pode?.video && !pode.audio && (
        <Nota className="mb-5">Este navegador não codifica áudio AAC: o MP4 sairá sem trilha e sem som. No Chrome ou no Edge do Windows funciona.</Nota>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[300px_1fr]">
        <Card className="lg:sticky lg:top-6">
          {resultado ? (
            <video src={resultado.url} controls playsInline className="mx-auto aspect-[9/16] w-full max-w-[270px] rounded-hig-lg bg-black" />
          ) : (
            <canvas ref={canvas} width={LARGURA_V} height={ALTURA_V} aria-label="Prévia do Reels" className="mx-auto aspect-[9/16] w-full max-w-[270px] rounded-hig-lg bg-black" />
          )}
          {!resultado && (
            <>
              <input type="range" aria-label="Posição na prévia" min={0} max={Math.max(total, 0.1)} step={1 / 30} value={Math.min(tempo, total)}
                onChange={(e) => { setTocando(false); setTempo(Number(e.target.value)); }} className="mt-3 w-full accent-blue" disabled={!total} />
              <div className="mt-1 flex items-center gap-2 text-cap1 text-label2 tabular-nums">
                <Button tamanho="sm" variante="secundario" disabled={!total} aria-label={tocando ? "Pausar" : "Tocar a prévia"}
                  onClick={() => { if (tempo >= total) setTempo(0); setTocando((v) => !v); }}>
                  {tocando ? <Pause /> : <Play />}
                </Button>
                <span>{seg(Math.min(tempo, total))}</span>
                <span className="mx-auto">{atual ? `cena ${atual.i + 1} de ${projeto.cenas.length}` : "sem cenas"}</span>
                <span>{seg(total)}</span>
              </div>
              <p className="mt-2 text-cap1 text-label2">A prévia pode pular quadros. O MP4 sai com todos, em 1080 × 1920 e 30 fps. A trilha só toca no MP4.</p>
            </>
          )}
          {falhaMidia && <p role="alert" className="mt-2 text-cap1 text-red">{falhaMidia}</p>}

          {gerar.isPending && (
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-fill3"><i className="block h-full bg-blue transition-[width]" style={{ width: `${Math.round(progresso * 100)}%` }} /></div>
              <div className="mt-2 flex items-center gap-2 text-cap1 text-label2">
                <span>{Math.round(progresso * 100)}% · não feche a aba.</span>
                <Button tamanho="sm" variante="simples" className="ml-auto" onClick={() => { cancelado.current = true; }}>Cancelar</Button>
              </div>
            </div>
          )}
          {gerar.error && <p role="alert" className="mt-3 text-foot text-red">{gerar.error.message}</p>}

          {resultado && (
            <div className="mt-4 grid gap-2">
              <p className="text-foot text-label2">MP4 pronto · {(resultado.blob.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB · {seg(total)}</p>
              <select aria-label="Produto (pasta do post)" className="campo" value={produto} onChange={(e) => setProduto(e.target.value)}>
                {PRODUTOS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <Button onClick={() => publicar.mutate()} disabled={publicar.isPending || demo}>
                {publicar.isPending ? <LoaderCircle className="animate-spin" /> : <ArrowRight />} {publicar.isPending ? `Enviando… ${Math.round(progresso)}%` : "Criar Reels e publicar"}
              </Button>
              <div className="flex gap-2">
                <Button variante="secundario" className="flex-1" onClick={() => baixar(resultado.blob, "reels.mp4")}><Download /> Baixar</Button>
                <Button variante="secundario" className="flex-1" onClick={() => setResultado(null)} disabled={publicar.isPending}><RefreshCw /> Editar</Button>
              </div>
              {publicar.error && <p role="alert" className="text-foot text-red">{publicar.error.message}</p>}
              <p className="text-cap1 text-label2">O vídeo vai para o Banco de mídias (pasta Reels) e abre no Publicar, com a legenda e a automação "QUERO".</p>
            </div>
          )}
        </Card>

        <div className="grid gap-5">
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <h3>Linha do tempo</h3>
              <span className={cn("text-foot tabular-nums", longo ? "text-red" : "text-label2")}>
                {projeto.cenas.length} {projeto.cenas.length === 1 ? "cena" : "cenas"} · {seg(total)} de até {seg(MAX_SEGUNDOS)}
              </span>
              <div className="ml-auto flex gap-2">
                <Button tamanho="sm" variante="secundario" onClick={() => setEscolha("cenas")} disabled={demo || projeto.cenas.length >= MAX_CENAS}><ImagePlus /> Fotos e vídeos</Button>
                <Button tamanho="sm" variante="secundario" disabled={projeto.cenas.length >= MAX_CENAS}
                  onClick={() => { mudar({ cenas: [...projeto.cenas, cenaDeCta()] }); setSel(projeto.cenas.length); }}><Megaphone /> CTA</Button>
              </div>
            </div>
            {projeto.cenas.length ? (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                {projeto.cenas.map((c, i) => {
                  const u = c.midia ? urls.get(c.midia.storage_path) : null;
                  return (
                    <button key={c.id} type="button" onClick={() => selecionar(i)} aria-pressed={i === sel}
                      style={{ width: Math.max(88, duracaoDa(c) * 26), background: c.tipo === "cta" ? cor : undefined }}
                      className={cn("relative h-28 flex-none overflow-hidden rounded-hig-lg bg-bg3 text-left", i === sel && "ring-3 ring-blue")}>
                      {u && (c.tipo === "video"
                        ? <video src={u} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />
                        : <img src={u} alt="" className="absolute inset-0 size-full object-cover" />)}
                      <small className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-cap2 font-semibold text-white">
                        {i + 1} · {c.tipo === "foto" ? "Foto" : c.tipo === "video" ? "Vídeo" : "CTA"} · {duracaoDa(c).toFixed(1).replace(".0", "").replace(".", ",")} s
                      </small>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 rounded-hig-lg border border-dashed border-sep py-8 text-center text-foot text-label2">
                Comece pelas fotos e vídeos do Banco de mídias. Termine com uma cena de CTA.
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-foot text-label2">
              <Music className="size-4" aria-hidden />
              {projeto.trilha ? <span className="truncate">Trilha: <b className="text-label">{projeto.trilha.nome}</b></span> : <span>Sem trilha</span>}
              <Button tamanho="sm" variante="simples" onClick={() => setEscolha("trilha")} disabled={demo}>{projeto.trilha ? "Trocar" : "Escolher trilha"}</Button>
              {projeto.trilha && <Button tamanho="sm" variante="simples" onClick={() => mudar({ trilha: null })} aria-label="Tirar a trilha"><X /></Button>}
            </div>
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              {cena ? (
                <>
                  <div className="flex items-center gap-2">
                    <h3>Cena {sel + 1} · {cena.tipo === "foto" ? "foto" : cena.tipo === "video" ? "vídeo" : "CTA"}</h3>
                    <div className="ml-auto flex">
                      <Button tamanho="icone" variante="simples" aria-label="Mover para a esquerda" onClick={() => mover(-1)} disabled={sel === 0}><ArrowLeft /></Button>
                      <Button tamanho="icone" variante="simples" aria-label="Mover para a direita" onClick={() => mover(1)} disabled={sel === projeto.cenas.length - 1}><ArrowRight /></Button>
                      <Button tamanho="icone" variante="simples" aria-label="Remover a cena" onClick={remover}><Trash2 /></Button>
                    </div>
                  </div>
                  {cena.midia && (
                    <p className="mt-1 flex items-center gap-2 text-cap1 text-label2">
                      <span className="truncate">{cena.midia.nome}</span>
                      <Button tamanho="sm" variante="simples" onClick={() => setEscolha("trocar")}>Trocar</Button>
                    </p>
                  )}

                  <Rotulo>Texto da cena</Rotulo>
                  <textarea className="campo min-h-20" maxLength={140} value={cena.texto} placeholder={cena.tipo === "cta" ? "Comente QUERO e receba no direct" : "Opcional"}
                    onChange={(e) => mudarCena({ texto: e.target.value })} />
                  {cena.tipo !== "cta" && (
                    <>
                      <Rotulo>Posição do texto</Rotulo>
                      <Segmentado rotulo="Posição do texto" valor={cena.posicao} onChange={(v) => mudarCena({ posicao: v })}
                        opcoes={[{ valor: "topo", rotulo: "Topo" }, { valor: "centro", rotulo: "Centro" }, { valor: "base", rotulo: "Embaixo" }]} />
                    </>
                  )}
                  {cena.tipo === "foto" && (
                    <>
                      <Rotulo>Movimento</Rotulo>
                      <Segmentado rotulo="Movimento" valor={cena.movimento} onChange={(v) => mudarCena({ movimento: v })}
                        opcoes={[{ valor: "zoom", rotulo: "Zoom lento" }, { valor: "panoramica", rotulo: "Panorâmica" }, { valor: "parado", rotulo: "Parado" }]} />
                    </>
                  )}
                  {cena.tipo !== "video" ? (
                    <>
                      <Rotulo>Duração</Rotulo>
                      <Segmentado rotulo="Duração" valor={String(cena.duracao)} onChange={(v) => mudarCena({ duracao: Number(v) })}
                        opcoes={["3", "4", "5", "6", "8"].map((s) => ({ valor: s, rotulo: `${s} s` }))} />
                    </>
                  ) : (
                    <>
                      <Rotulo>Trecho do vídeo (segundos)</Rotulo>
                      <div className="flex flex-wrap items-center gap-2 text-foot">
                        <label className="flex items-center gap-2">Início
                          <input type="number" className="campo w-24" min={0} step={0.5} value={cena.inicio}
                            onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); mudarCena({ inicio: v, fim: Math.max(cena.fim, v + 0.5) }); }} />
                        </label>
                        <label className="flex items-center gap-2">Fim
                          <input type="number" className="campo w-24" min={cena.inicio + 0.5} max={cena.midia?.duracao_s ?? undefined} step={0.5} value={cena.fim}
                            onChange={(e) => {
                              const max = cena.midia?.duracao_s ?? Infinity;
                              mudarCena({ fim: Math.min(max, Math.max(cena.inicio + 0.5, Number(e.target.value) || 0)) });
                            }} />
                        </label>
                        {cena.midia?.duracao_s != null && <span className="text-label2">de {cena.midia.duracao_s.toFixed(1).replace(".", ",")} s</span>}
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="text-foot">Som do vídeo</span>
                        <Toggle rotulo="Som do vídeo" ligado={cena.som} onChange={(v) => mudarCena({ som: v })} />
                      </div>
                    </>
                  )}
                </>
              ) : (
                <p className="text-foot text-label2">Escolha uma cena na linha do tempo para editar.</p>
              )}
            </Card>

            <Card>
              <h3>Vídeo inteiro</h3>
              <Rotulo>Transição</Rotulo>
              <Segmentado rotulo="Transição" valor={projeto.transicao} onChange={(v) => mudar({ transicao: v })}
                opcoes={[{ valor: "corte", rotulo: "Corte seco" }, { valor: "esmaecer", rotulo: "Esmaecer" }]} />
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-foot">Legenda grande</span>
                <Toggle rotulo="Legenda grande" ligado={projeto.legendaGrande} onChange={(v) => mudar({ legendaGrande: v })} />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <span className="text-foot">Logo no canto</span>
                {projeto.logo && urls.get(projeto.logo) && <img src={urls.get(projeto.logo)!} alt="Logo escolhido" className="size-9 rounded-md bg-bg3 object-contain p-1" />}
                <Button tamanho="sm" variante="simples" className="ml-auto" onClick={() => setEscolha("logo")} disabled={demo}>{projeto.logo ? "Trocar" : <><Plus /> Escolher</>}</Button>
                {projeto.logo && <Button tamanho="sm" variante="simples" onClick={() => mudar({ logo: null })} aria-label="Tirar o logo"><X /></Button>}
              </div>
              <p className="mt-4 text-cap1 text-label2">
                A cena de CTA usa a cor principal do DNA da marca. O Instagram cobre a base e a direita do Reels com botões: o texto
                "Embaixo" já fica acima dessa área.
              </p>
            </Card>
          </div>
        </div>
      </div>

      <SeletorMidia
        aberto={escolha !== null}
        max={escolha === "cenas" ? MAX_CENAS - projeto.cenas.length : 1}
        tipos={escolha === "trilha" ? ["trilha"] : escolha === "logo" ? ["logo"] : ["imagem", "video"]}
        titulo={escolha === "trilha" ? "Trilha do Reels" : escolha === "logo" ? "Logo no canto" : escolha === "trocar" ? "Trocar a mídia da cena" : "Fotos e vídeos do Reels"}
        onFechar={() => setEscolha(null)}
        onEscolher={escolher}
      />
    </section>
  );
}
