import { useRef, useState, type DragEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudUpload, Images, Music, Trash2, Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, Segmentado } from "@/components/ui/hig";
import { Pastas } from "@/components/ui/pastas";
import { contarPastas } from "@/lib/pastas";
import { useAcesso } from "@/features/auth/acesso";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { type Midia, useMidias } from "./dados";
import { BUCKET, enviarParaBanco, tamanhoLegivel, type TipoMidia } from "./envio";

type Aba = "tudo" | TipoMidia;
type Envio = { id: string; nome: string; pct: number; erro?: string };

const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: "tudo", rotulo: "Tudo" },
  { valor: "imagem", rotulo: "Imagens" },
  { valor: "video", rotulo: "Vídeos" },
  { valor: "logo", rotulo: "Logos e marca" },
  { valor: "trilha", rotulo: "Trilhas livres" },
  { valor: "print", rotulo: "Prints dos sistemas" },
];
const COTA_GRATIS = 1024 * 1024 * 1024; // 1 GB do Storage no plano gratuito

function Miniatura({ m, onApagar, apagando }: { m: Midia & { url: string | null }; onApagar: () => void; apagando: boolean }) {
  const info = [m.largura && m.altura ? `${m.largura}×${m.altura}` : null, m.duracao_s ? `${Math.round(m.duracao_s)} s` : null, tamanhoLegivel(m.tamanho_bytes)]
    .filter(Boolean)
    .join(" · ");
  return (
    <figure className="group relative aspect-square overflow-hidden rounded-hig-lg bg-bg3 text-white shadow-hig">
      {m.url && (m.tipo === "video" ? (
        <video src={m.url} muted playsInline preload="metadata" className="size-full object-cover" />
      ) : m.tipo === "trilha" ? (
        <div className="grid size-full place-items-center bg-[linear-gradient(160deg,#5B21B6,#9333EA)]">
          <Music className="size-10 opacity-90" aria-hidden />
        </div>
      ) : (
        <img src={m.url} alt={m.nome} loading="lazy" className={cn("size-full", m.tipo === "logo" ? "object-contain p-4" : "object-cover")} />
      ))}
      <figcaption className="absolute inset-x-2 bottom-2 rounded-[6px] bg-black/60 px-2 py-1 text-cap1 backdrop-blur">
        <span className="block truncate font-medium" title={m.nome}>{m.nome}</span>
        <span className="block truncate text-white/70">{info}</span>
      </figcaption>
      <button
        type="button"
        onClick={onApagar}
        disabled={apagando}
        aria-label={`Apagar ${m.nome}`}
        className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-black/60 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40"
      >
        <Trash2 className="size-4" />
      </button>
    </figure>
  );
}

export function BancoDeMidias() {
  const { demo, conta } = useAcesso();
  const cliente = useQueryClient();
  const { data: midias = [], isLoading, error } = useMidias();
  const [aba, setAba] = useState<Aba>("tudo");
  const [pasta, setPasta] = useState<string | null>(null);
  const [pastasNovas, setPastasNovas] = useState<string[]>([]);
  const [enviarComo, setEnviarComo] = useState<"auto" | "logo" | "print">("auto");
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const apagar = useMutation({
    mutationFn: async (m: Midia) => {
      const { error: eArq } = await supabase.storage.from(BUCKET).remove([m.storage_path]);
      if (eArq) throw eArq;
      const { error: eReg } = await supabase.from("midias").delete().eq("id", m.id);
      if (eReg) throw eReg;
    },
    onSettled: () => cliente.invalidateQueries({ queryKey: ["midias"] }),
  });

  const atualiza = (id: string, mudanca: Partial<Envio>) => setEnvios((l) => l.map((e) => (e.id === id ? { ...e, ...mudanca } : e)));

  async function enviar(arquivos: File[]) {
    if (!conta || demo) return;
    const destino = pasta ?? "Geral";
    for (const arquivo of arquivos) {
      const id = crypto.randomUUID();
      setEnvios((l) => [...l, { id, nome: arquivo.name, pct: 0 }]);
      try {
        await enviarParaBanco({ contaId: conta.conta_id, arquivo, pasta: destino, enviarComo, onProgresso: (pct) => atualiza(id, { pct }) });
        setEnvios((l) => l.filter((e) => e.id !== id));
      } catch (e) {
        atualiza(id, { erro: e instanceof Error ? e.message : String((e as { message?: string }).message ?? e) });
      }
    }
    cliente.invalidateQueries({ queryKey: ["midias"] });
  }

  function soltar(e: DragEvent) {
    e.preventDefault();
    setArrastando(false);
    enviar([...e.dataTransfer.files]);
  }

  const daPasta = midias.filter((m) => pasta === null || m.pasta === pasta);
  const lista = daPasta.filter((m) => aba === "tudo" || m.tipo === aba);
  const usado = midias.reduce((s, m) => s + (m.tamanho_bytes ?? 0), 0);
  const contaAba = (a: Aba) => (a === "tudo" ? daPasta.length : daPasta.filter((m) => m.tipo === a).length);

  return (
    <section className="pagina-entra">
      <PageHeader
        titulo="Banco de mídias"
        subtitulo="Fotos, vídeos, logos e trilhas para usar nos posts e Reels"
        icone={Images}
        cor="teal"
        acoes={
          <Button onClick={() => entrada.current?.click()} disabled={demo || !conta}>
            <Upload /> Enviar arquivos
          </Button>
        }
      />
      <input
        ref={entrada}
        type="file"
        multiple
        hidden
        accept="image/*,video/mp4,video/quicktime,video/webm,audio/*"
        onChange={(e) => {
          enviar([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />

      <Segmentado<Aba>
        rotulo="Tipo de mídia"
        valor={aba}
        onChange={setAba}
        className="mb-5 max-w-full overflow-x-auto"
        opcoes={ABAS.map((a) => ({
          valor: a.valor,
          rotulo: <>{a.rotulo}<span className="ml-1.5 font-normal text-label2">{contaAba(a.valor)}</span></>,
        }))}
      />

      <Pastas
        pastas={contarPastas(midias, pastasNovas)}
        valor={pasta}
        onChange={setPasta}
        onNova={(n) => setPastasNovas((l) => (l.includes(n) ? l : [...l, n]))}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={soltar}
        className={cn(
          "mb-6 rounded-hig-xl border-[1.5px] border-dashed bg-fill3 p-8 text-center text-label2 transition-colors",
          arrastando ? "border-blue bg-blue/10" : "border-label3",
        )}
      >
        <CloudUpload className="mx-auto size-[34px] text-blue" aria-hidden />
        <p className="mt-2 text-sub">
          Arraste fotos, vídeos e trilhas aqui ·{" "}
          <button type="button" className="font-semibold text-blue" onClick={() => entrada.current?.click()} disabled={demo || !conta}>
            escolher arquivos
          </button>{" "}
          · até 100 MB
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-foot">
          <span>Imagens entram como</span>
          <Segmentado
            rotulo="Imagens entram como"
            valor={enviarComo}
            onChange={setEnviarComo}
            opcoes={[
              { valor: "auto", rotulo: "Imagem" },
              { valor: "logo", rotulo: "Logo" },
              { valor: "print", rotulo: "Print" },
            ]}
          />
          <span>na pasta <b className="text-label">{pasta ?? "Geral"}</b></span>
        </div>
        <small className="mt-3 block text-cap1">
          Supabase Storage · 1 GB grátis · usado: {tamanhoLegivel(usado)} ({Math.min(100, Math.round((usado / COTA_GRATIS) * 100))}%)
        </small>
      </div>

      {envios.length > 0 && (
        <Card className="mb-6 grid gap-3 p-5" aria-live="polite">
          {envios.map((e) => (
            <div key={e.id}>
              <div className="flex justify-between gap-3 text-foot">
                <span className="truncate">{e.nome}</span>
                <span className={e.erro ? "text-red" : "text-label2"}>{e.erro ? "erro" : `${e.pct}%`}</span>
              </div>
              {e.erro ? (
                <p className="mt-1 text-cap1 text-red">
                  {e.erro}{" "}
                  <button type="button" className="underline" onClick={() => setEnvios((l) => l.filter((x) => x.id !== e.id))}>fechar</button>
                </p>
              ) : (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fill3" role="progressbar" aria-valuenow={e.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Enviando ${e.nome}`}>
                  <div className="h-full rounded-full bg-blue transition-[width] duration-200" style={{ width: `${e.pct}%` }} />
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {(error || apagar.error) && <Card className="mb-6 text-red">Não foi possível {error ? "carregar" : "apagar"} as mídias. Atualize a página.</Card>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-busy={isLoading}>
        {isLoading
          ? Array.from({ length: 10 }, (_, i) => <div key={i} className="aspect-square animate-pulse rounded-hig-lg bg-bg2" />)
          : lista.map((m) => (
              <Miniatura
                key={m.id}
                m={m}
                apagando={apagar.isPending && apagar.variables?.id === m.id}
                onApagar={() => window.confirm(`Apagar "${m.nome}"? O arquivo sai do Storage.`) && apagar.mutate(m)}
              />
            ))}
      </div>

      {!isLoading && !error && lista.length === 0 && (
        <p className="py-8 text-center text-sub text-label2">
          {midias.length ? "Nada nesta aba ou pasta." : "Nenhuma mídia ainda. Envie a primeira pelo quadro acima."}
        </p>
      )}
    </section>
  );
}
