import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, Play, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmentado } from "@/components/ui/hig";
import { useAcesso } from "@/features/auth/acesso";
import { enviarParaBanco } from "@/features/midias/envio";
import { type Midia, useMidias } from "@/features/midias/dados";
import { cn } from "@/lib/utils";

export type MidiaEscolhida = Pick<Midia, "id" | "storage_path" | "tipo" | "mime" | "nome" | "duracao_s">;
type Aba = "imagem" | "video" | "logo";

const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: "imagem", rotulo: "Fotos" }, { valor: "video", rotulo: "Vídeos" }, { valor: "logo", rotulo: "Logos" },
];

/**
 * Escolher fotos e vídeos do Banco de mídias (Fase 12). `max` 1 = escolha única (fecha ao clicar);
 * mais que 1 = marca vários e confirma. Também envia arquivos do computador direto para o Banco.
 */
export function SeletorMidia({
  aberto, onFechar, onEscolher, max = 1, tipos = ["imagem", "video", "logo"], titulo = "Escolher do Banco de mídias",
}: {
  aberto: boolean; onFechar: () => void; onEscolher: (m: MidiaEscolhida[]) => void; max?: number; tipos?: Aba[]; titulo?: string;
}) {
  const { conta, demo } = useAcesso();
  const cliente = useQueryClient();
  const { data: midias = [], isLoading, error } = useMidias();
  const ref = useRef<HTMLDialogElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const [aba, setAba] = useState<Aba>(tipos[0]);
  const [pasta, setPasta] = useState("todas");
  const [marcadas, setMarcadas] = useState<MidiaEscolhida[]>([]);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) {
      setMarcadas([]);
      setFalha(null);
      d.showModal();
    }
    if (!aberto && d.open) d.close();
  }, [aberto]);

  const daAba = midias.filter((m) => m.tipo === aba);
  const pastas = useMemo(() => [...new Set(daAba.map((m) => m.pasta))].sort(), [daAba]);
  const lista = pasta === "todas" ? daAba : daAba.filter((m) => m.pasta === pasta);

  function clicar(m: Midia) {
    const escolhida: MidiaEscolhida = { id: m.id, storage_path: m.storage_path, tipo: m.tipo, mime: m.mime, nome: m.nome, duracao_s: m.duracao_s };
    if (max === 1) return onEscolher([escolhida]);
    setMarcadas((l) => (l.some((x) => x.id === m.id) ? l.filter((x) => x.id !== m.id) : l.length >= max ? l : [...l, escolhida]));
  }

  async function enviar(arquivos: File[]) {
    if (!conta || demo) return;
    setFalha(null);
    for (const arquivo of arquivos) {
      setEnviando(arquivo.name);
      try {
        await enviarParaBanco({ contaId: conta.conta_id, arquivo, pasta: pasta === "todas" ? "Geral" : pasta });
      } catch (e) {
        setFalha(`${arquivo.name}: ${(e as { message?: string }).message ?? "falha no envio"}`);
      }
    }
    setEnviando(null);
    await cliente.invalidateQueries({ queryKey: ["midias"] });
  }

  return (
    <dialog
      ref={ref}
      onClose={onFechar}
      onClick={(e) => e.target === ref.current && onFechar()}
      aria-label={titulo}
      className="m-auto w-[min(920px,calc(100vw-32px))] rounded-hig-2xl bg-bg2 p-0 text-label shadow-hig backdrop:bg-black/60"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-sep p-4">
        <b className="text-sub">{titulo}</b>
        {max > 1 && <span className="text-foot text-label2">{marcadas.length} de até {max}</span>}
        <Button tamanho="icone" variante="simples" className="ml-auto" onClick={onFechar} aria-label="Fechar"><X /></Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4">
        {tipos.length > 1 && <Segmentado rotulo="Tipo de mídia" opcoes={ABAS.filter((a) => tipos.includes(a.valor))} valor={aba} onChange={(v) => { setAba(v); setPasta("todas"); }} />}
        <select aria-label="Pasta" className="campo max-w-56 min-h-9 py-1 text-foot" value={pasta} onChange={(e) => setPasta(e.target.value)}>
          <option value="todas">Todas as pastas</option>
          {pastas.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <Button tamanho="sm" variante="secundario" className="ml-auto" onClick={() => entrada.current?.click()} disabled={!!enviando || demo}>
          {enviando ? <LoaderCircle className="animate-spin" /> : <Upload />} {enviando ? "Enviando…" : "Enviar do computador"}
        </Button>
        <input ref={entrada} type="file" multiple hidden accept={aba === "video" ? "video/mp4,video/quicktime" : "image/jpeg,image/png,image/webp"}
          onChange={(e) => { enviar([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </div>
      {falha && <p role="alert" className="px-4 pt-2 text-cap1 text-red">{falha}</p>}

      <div className="max-h-[60vh] overflow-auto p-4">
        {demo ? (
          <p className="py-10 text-center text-foot text-label2">Modo demonstração: o Banco de mídias não é carregado.</p>
        ) : isLoading ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{Array.from({ length: 10 }, (_, i) => <div key={i} className="aspect-square animate-pulse rounded-hig-lg bg-bg3" />)}</div>
        ) : error ? (
          <p className="py-10 text-center text-foot text-red">Não foi possível ler o Banco de mídias.</p>
        ) : !lista.length ? (
          <p className="py-10 text-center text-foot text-label2">Nada aqui ainda. Envie do computador ou pelo Banco de mídias.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {lista.map((m) => {
              const n = marcadas.findIndex((x) => x.id === m.id);
              return (
                <button key={m.id} type="button" onClick={() => clicar(m)} aria-pressed={n >= 0} title={m.nome}
                  className={cn("relative aspect-square overflow-hidden rounded-hig-lg bg-bg3 focus-visible:ring-2 focus-visible:ring-blue", n >= 0 && "ring-3 ring-blue")}>
                  {m.url && (m.tipo === "video"
                    ? <video src={m.url} muted playsInline preload="metadata" className="size-full object-cover" />
                    : <img src={m.url} alt={m.nome} loading="lazy" className={cn("size-full", m.tipo === "logo" ? "object-contain p-3" : "object-cover")} />)}
                  {m.tipo === "video" && (
                    <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-cap2 font-semibold text-white">
                      <Play className="size-3" />{m.duracao_s ? `${Math.round(m.duracao_s)} s` : "vídeo"}
                    </span>
                  )}
                  {n >= 0 && <span className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-blue text-cap1 font-bold text-white">{max > 1 ? n + 1 : <Check className="size-3.5" />}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {max > 1 && (
        <div className="flex items-center gap-3 border-t border-sep p-4">
          <span className="text-foot text-label2">A ordem dos números é a ordem do carrossel.</span>
          <Button className="ml-auto" disabled={!marcadas.length} onClick={() => onEscolher(marcadas)}>Usar {marcadas.length || ""} {marcadas.length === 1 ? "item" : "itens"}</Button>
        </div>
      )}
    </dialog>
  );
}
