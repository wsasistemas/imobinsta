import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dna as IconeDna, LoaderCircle, RefreshCw, Save } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/hig";
import { useAcesso } from "@/features/auth/acesso";
import { Nota } from "@/features/criar/comum";
import { chamarFuncao } from "@/features/criar/dados";
import { supabase } from "@/lib/supabase";
import { type Dna, useDna } from "./dados";

const lista = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const juntar = (v: string[] | undefined) => (v ?? []).join(", ");

/** DNA da marca (Fase 10): o "Pomelli" do estúdio. Lê o site e guia toda geração de texto. */
export function MarcaDna() {
  const { conta, demo } = useAcesso();
  const dono = conta?.papel === "dono";
  const dna = useDna();
  const cliente = useQueryClient();
  const [url, setUrl] = useState("");

  const ler = useMutation({
    mutationFn: () => chamarFuncao<Dna & { paginas_lidas: number }>("ia-texto", { acao: "dna", conta_id: conta!.conta_id, url: url || dna.data?.site_url }),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ["marca-dna"] }),
  });

  if (dna.isLoading) return <div className="grid h-[60vh] place-items-center text-label2"><LoaderCircle className="size-6 animate-spin" /></div>;

  return (
    <section className="pagina-entra">
      <PageHeader titulo="DNA da marca" subtitulo="O estúdio lê o seu site e aprende cores, fontes, imagens e jeito de falar" icone={IconeDna} cor="pink" />
      {demo && <Nota className="mb-5">Modo demonstração: o DNA da marca não é lido aqui.</Nota>}
      {dna.error && <Card role="alert" className="mb-5 text-red">{dna.error.message}</Card>}

      <Card className="mb-5">
        <label htmlFor="dna-url" className="text-foot text-label2">Endereço do site</label>
        <div className="mt-2 flex flex-wrap gap-3">
          <input id="dna-url" className="campo min-w-0 flex-1" placeholder="https://suaempresa.com.br" value={url || dna.data?.site_url || ""}
            onChange={(e) => setUrl(e.target.value)} disabled={!dono || demo} />
          <Button onClick={() => ler.mutate()} disabled={!dono || demo || ler.isPending || !(url || dna.data?.site_url)}>
            {ler.isPending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} {ler.isPending ? "Lendo o site… (até 1 min)" : dna.data ? "Ler de novo" : "Ler site"}
          </Button>
        </div>
        <p className="mt-2 text-cap1 text-label2">
          Lê a página inicial e até 3 páginas internas. Usa o Gemini (cota gratuita). As imagens vão para o Banco de mídias, pasta "Marca".
          {dna.data?.lido_em && ` Lido em ${new Date(dna.data.lido_em).toLocaleString("pt-BR")}.`}
        </p>
        {ler.error && <p role="alert" className="mt-2 text-foot text-red">{ler.error.message}</p>}
        {ler.data && <p role="status" className="mt-2 text-foot text-green">DNA lido de {ler.data.paginas_lidas} página(s). Confira e ajuste abaixo.</p>}
        {!dono && <p className="mt-2 text-cap1 text-label2">Só o dono da conta lê e edita o DNA.</p>}
      </Card>

      {dna.data ? <Editor key={dna.data.editado_em} contaId={conta!.conta_id} inicial={dna.data} editavel={dono && !demo} /> : (
        <Card className="text-label2">Ainda sem DNA. Informe o endereço do site e clique em <b>Ler site</b>.</Card>
      )}
    </section>
  );
}

function Editor({ contaId, inicial, editavel }: { contaId: string; inicial: Dna; editavel: boolean }) {
  const cliente = useQueryClient();
  const [cores, setCores] = useState<string[]>(inicial.cores.length ? inicial.cores : ["#0A4FD6"]);
  const [fonteTitulo, setFonteTitulo] = useState(inicial.fontes.titulo ?? "");
  const [fonteTexto, setFonteTexto] = useState(inicial.fontes.texto ?? "");
  const [adjetivos, setAdjetivos] = useState(juntar(inicial.tom.adjetivos));
  const [descricao, setDescricao] = useState(inicial.tom.descricao ?? "");
  const [exemplos, setExemplos] = useState((inicial.tom.exemplos ?? []).join("\n"));
  const [publico, setPublico] = useState(inicial.publico ?? "");
  const [proposta, setProposta] = useState(inicial.proposta ?? "");
  const [pilares, setPilares] = useState(inicial.pilares.join("\n"));
  const [usar, setUsar] = useState(juntar(inicial.usar));
  const [evitar, setEvitar] = useState(juntar(inicial.evitar));

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("marca_dna").update({
        cores: cores.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 8),
        fontes: { titulo: fonteTitulo.trim(), texto: fonteTexto.trim() },
        tom: { adjetivos: lista(adjetivos).slice(0, 5), descricao: descricao.trim(), exemplos: exemplos.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 3) },
        publico: publico.trim() || null, proposta: proposta.trim() || null,
        pilares: pilares.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 5),
        usar: lista(usar).slice(0, 10), evitar: lista(evitar).slice(0, 10), editado_em: new Date().toISOString(),
      }).eq("conta_id", contaId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => cliente.invalidateQueries({ queryKey: ["marca-dna"] }),
  });

  return (
    <fieldset disabled={!editavel} className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3>Cores</h3>
          <p className="mt-1 text-foot text-label2">Do site (theme-color e folhas de estilo). A primeira é a principal; a segunda, o destaque do template "Marca".</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {cores.map((c, i) => (
              <label key={i} className="grid w-20 gap-1.5 text-center">
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(c) ? c : "#000000"} aria-label={`Cor ${i + 1}`}
                  onChange={(e) => setCores(cores.map((x, k) => (k === i ? e.target.value.toUpperCase() : x)))}
                  className="h-14 w-20 cursor-pointer rounded-hig-lg border border-sep bg-transparent" />
                <small className="font-mono text-cap1 text-label2">{c}</small>
              </label>
            ))}
            {cores.length < 8 && (
              <button type="button" onClick={() => setCores([...cores, "#888888"])} className="grid h-14 w-20 place-items-center rounded-hig-lg border border-dashed border-sep text-label2">+</button>
            )}
          </div>
        </Card>

        <Card>
          <h3>Fontes</h3>
          <p className="mt-1 text-foot text-label2">Encontradas no site. Servem de referência para os criativos.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[90px_1fr] sm:items-center">
            <label htmlFor="dna-ft" className="text-foot text-label2">Títulos</label>
            <input id="dna-ft" className="campo" value={fonteTitulo} onChange={(e) => setFonteTitulo(e.target.value)} />
            <label htmlFor="dna-fx" className="text-foot text-label2">Texto</label>
            <input id="dna-fx" className="campo" value={fonteTexto} onChange={(e) => setFonteTexto(e.target.value)} />
          </div>
        </Card>

        <Card>
          <h3>Imagens</h3>
          <p className="mt-1 text-foot text-label2">Logo e imagens do site, guardadas no Banco de mídias (pasta "Marca").</p>
          <Imagens imagens={inicial.imagens} />
        </Card>

        <Card>
          <h3>Tom de voz</h3>
          <div className="mt-3 grid gap-3">
            <label className="text-foot text-label2" htmlFor="dna-adj">Adjetivos (separados por vírgula)</label>
            <input id="dna-adj" className="campo" value={adjetivos} onChange={(e) => setAdjetivos(e.target.value)} />
            <label className="text-foot text-label2" htmlFor="dna-desc">Como a marca fala</label>
            <textarea id="dna-desc" className="campo min-h-20" maxLength={400} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            <label className="text-foot text-label2" htmlFor="dna-ex">Frases no estilo da marca (uma por linha)</label>
            <textarea id="dna-ex" className="campo min-h-20" value={exemplos} onChange={(e) => setExemplos(e.target.value)} />
          </div>
        </Card>
      </div>

      <Card>
        <h3>Público, proposta e pilares</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <label className="grid gap-1.5 text-foot text-label2">Público
            <textarea className="campo min-h-20 text-label" maxLength={400} value={publico} onChange={(e) => setPublico(e.target.value)} /></label>
          <label className="grid gap-1.5 text-foot text-label2">Proposta de valor
            <textarea className="campo min-h-20 text-label" maxLength={400} value={proposta} onChange={(e) => setProposta(e.target.value)} /></label>
          <label className="grid gap-1.5 text-foot text-label2">Pilares de conteúdo (um por linha)
            <textarea className="campo min-h-24 text-label" value={pilares} onChange={(e) => setPilares(e.target.value)} /></label>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-foot text-label2">Palavras para usar
              <input className="campo text-label" value={usar} onChange={(e) => setUsar(e.target.value)} /></label>
            <label className="grid gap-1.5 text-foot text-label2">Palavras para evitar
              <input className="campo text-label" value={evitar} onChange={(e) => setEvitar(e.target.value)} /></label>
          </div>
        </div>
      </Card>

      {editavel && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>{salvar.isPending ? <LoaderCircle className="animate-spin" /> : <Save />} Salvar DNA</Button>
          {salvar.error && <span role="alert" className="text-foot text-red">{salvar.error.message}</span>}
          {salvar.isSuccess && <span role="status" className="text-foot text-green">Salvo. As próximas gerações já usam este DNA.</span>}
        </div>
      )}
      <Nota>O DNA vai junto em toda geração de texto (legenda, carrossel, roteiro, pautas e campanhas) e dá as cores do template "Marca". O que o site não diz fica em branco: a IA não inventa.</Nota>
    </fieldset>
  );
}

function Imagens({ imagens }: { imagens: Dna["imagens"] }) {
  const urls = useQuery({
    queryKey: ["dna-imagens", imagens.map((i) => i.storage_path).join("|")],
    enabled: imagens.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("imobinsta-midias").createSignedUrls(imagens.map((i) => i.storage_path), 3600);
      if (error) throw error;
      return data.map((d) => d.signedUrl);
    },
  });
  if (!imagens.length) return <p className="mt-4 text-foot text-label2">Nenhuma imagem encontrada no site.</p>;
  return (
    <div className="mt-4 grid grid-cols-4 gap-2">
      {imagens.map((img, i) => (
        <figure key={img.midia_id} className="m-0">
          {urls.data?.[i] ? <img src={urls.data[i]} alt="" className="aspect-square w-full rounded-hig-lg bg-white object-contain" />
            : <div className="aspect-square animate-pulse rounded-hig-lg bg-fill3" />}
          <figcaption className="mt-1 truncate text-cap2 text-label2">{img.origem}</figcaption>
        </figure>
      ))}
    </div>
  );
}
