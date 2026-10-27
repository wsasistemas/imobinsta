import { forwardRef, useLayoutEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import {
  BadgeCheck, Cake, ChartColumn, CircleCheck, Database, FileSignature, Headphones, House, type LucideIcon, MessageCircle,
  ShoppingCart, Sparkles, Users, Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import logo from "@/assets/wsa-logo.png";
import { supabase } from "@/lib/supabase";
import { coresDaMarca, useDna } from "@/features/marca/dados";
import { ALTURA, LARGURA, type DadosSlide, type TemplateId } from "./esquema";

/**
 * Templates HTML da WSA. Cada slide é desenhado em 1080×1350 reais (o PNG sai deste mesmo HTML)
 * e só é reduzido na tela com transform. A IA preenche apenas os campos de DadosSlide.
 */
type Estilo = {
  nome: string;
  fundo: (cor?: string) => string;
  texto: string;
  suave: string;
  destaque: string;
  fonteTitulo: string;
  caixaAlta: boolean;
  cartao: string;
  amostra: string; // gradiente da miniatura no seletor
};

const SANS = `-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, "Segoe UI", system-ui, sans-serif`;

export const TEMPLATES: Record<TemplateId, Estilo> = {
  "wsa-neon": {
    nome: "WSA Neon azul",
    fundo: (c) => c
      ? `radial-gradient(110% 120% at 85% 10%, ${c} 0%, #0B0B14 85%)`
      : "radial-gradient(110% 120% at 85% 10%, #2E5BFF 0%, #1A1F5C 45%, #0B0B14 85%)",
    texto: "#FFFFFF",
    suave: "rgba(255,255,255,0.78)",
    destaque: "#22D3EE",
    fonteTitulo: SANS,
    caixaAlta: true,
    cartao: "rgba(255,255,255,0.08)",
    amostra: "linear-gradient(160deg,#2E5BFF,#1A1F5C 60%,#0B0B14)",
  },
  "wsa-escuro": {
    nome: "WSA Escuro",
    fundo: (c) => c ?? "linear-gradient(180deg, #111114 0%, #050507 100%)",
    texto: "#F5F5F7",
    suave: "rgba(245,245,247,0.7)",
    destaque: "#FFD60A",
    fonteTitulo: SANS,
    caixaAlta: false,
    cartao: "rgba(255,255,255,0.06)",
    amostra: "linear-gradient(160deg,#2c2c2e,#050507)",
  },
  "wsa-docerias": {
    nome: "WSA Docerias",
    fundo: (c) => c
      ? `linear-gradient(160deg, ${c} 0%, #2A140D 100%)`
      : "linear-gradient(160deg, #6B2F3A 0%, #3B1F14 55%, #2A140D 100%)",
    texto: "#FFF4EC",
    suave: "rgba(255,244,236,0.8)",
    destaque: "#FF8FB1",
    fonteTitulo: `Georgia, "Times New Roman", serif`,
    caixaAlta: false,
    cartao: "rgba(255,244,236,0.1)",
    amostra: "linear-gradient(160deg,#FF8FB1,#6B2F3A 55%,#2A140D)",
  },
  // Cores vêm do DNA da marca (Fase 10) na hora de desenhar; estes são os valores sem DNA.
  marca: estiloMarca("#0A4FD6", "#0A4FD6"),
};

/** Template "Marca": fundo na cor principal do DNA, destaque na segunda cor. */
function estiloMarca(principal: string, destaque: string): Estilo {
  return {
    nome: "Marca (DNA)",
    fundo: (c) => `linear-gradient(160deg, ${c ?? principal} 0%, #0B1220 78%)`,
    texto: "#FFFFFF",
    suave: "rgba(255,255,255,0.8)",
    destaque,
    fonteTitulo: SANS,
    caixaAlta: false,
    cartao: "rgba(255,255,255,0.08)",
    amostra: `linear-gradient(160deg, ${principal}, #0B1220 70%)`,
  };
}

export const ORDEM_TEMPLATES: TemplateId[] = ["wsa-neon", "wsa-escuro", "wsa-docerias", "marca"];

/** Ícone da grade escolhido pelo texto do item (o JSON da IA só traz o texto). */
const ICONES: [RegExp, LucideIcon][] = [
  [/imob|im[oó]ve|aluguel|corret/i, House],
  [/compra|fornecedor|cota[cç]/i, ShoppingCart],
  [/help ?desk|suporte|chamado|atendimento/i, Headphones],
  [/cobran|assinatura|contrato|boleto/i, FileSignature],
  [/aprova/i, CircleCheck],
  [/\brh\b|pessoas|colaborador|folha/i, Users],
  [/totvs|erp|\brm\b|dados|banco/i, Database],
  [/doce|confeit|bolo|padaria/i, Cake],
  [/whats|direct|dm|mensag/i, MessageCircle],
  [/relat|indicador|dashboard|gest/i, ChartColumn],
  [/autom|ia\b|intelig/i, Zap],
  [/integr|seguran|confi/i, BadgeCheck],
];
function iconeDo(item: string): LucideIcon {
  return ICONES.find(([re]) => re.test(item))?.[1] ?? Sparkles;
}

/** *palavra* vira destaque na cor do template. */
function comDestaque(texto: string, cor: string): ReactNode {
  return texto.split(/(\*[^*]+\*)/g).map((parte, i) =>
    /^\*[^*]+\*$/.test(parte) ? <em key={i} style={{ color: cor, fontStyle: "normal" }}>{parte.slice(1, -1)}</em> : parte,
  );
}

type Edicao = { onCampo?: (campo: string, valor: string) => void; editavel?: boolean };

/** Texto do slide. Editável: ao clicar mostra o texto cru (com *asteriscos*) e grava ao sair. */
function Texto({
  campo, valor, cor, editavel, onCampo, como: Tag = "div", style,
}: Edicao & { campo: string; valor: string; cor: string; como?: ElementType; style?: CSSProperties }) {
  const [focado, setFocado] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!focado || !ref.current) return;
    const sel = window.getSelection();
    const faixa = document.createRange();
    faixa.selectNodeContents(ref.current);
    faixa.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(faixa);
  }, [focado]);
  if (!editavel) return <Tag style={style}>{comDestaque(valor, cor)}</Tag>;
  return (
    <Tag
      ref={ref}
      style={{ ...style, outline: focado ? "4px dashed rgba(255,255,255,0.55)" : undefined, outlineOffset: 8, cursor: "text" }}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-label={`Editar ${campo}`}
      onFocus={() => setFocado(true)}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        setFocado(false);
        const novo = (e.currentTarget.textContent ?? "").replace(/\s+/g, " ").trim();
        if (novo !== valor) onCampo?.(campo, novo);
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    >
      {focado ? valor : comDestaque(valor, cor)}
    </Tag>
  );
}

/**
 * Imagem do bucket privado como data URL. Data URL (e não a URL assinada) para o html-to-image
 * embutir no JPEG sem depender de CORS; o cache do React Query evita baixar de novo a cada render.
 */
function useImagemMidia(caminho: string | undefined) {
  return useQuery({
    queryKey: ["midia-dataurl", caminho],
    enabled: !!caminho,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("imobinsta-midias").download(caminho!);
      if (error || !data) throw error ?? new Error("Imagem não encontrada");
      return await new Promise<string>((ok, falha) => {
        const leitor = new FileReader();
        leitor.onload = () => ok(String(leitor.result));
        leitor.onerror = () => falha(leitor.error);
        leitor.readAsDataURL(data);
      });
    },
  }).data;
}

type PropsSlide = Edicao & {
  template: TemplateId;
  dados: DadosSlide;
  n: number;
  total: number;
  logo: boolean;
};

/** O slide em tamanho real (1080×1350). */
export const Slide = forwardRef<HTMLDivElement, PropsSlide>(function Slide({ template, dados, n, total, logo: comLogo, editavel, onCampo }, ref) {
  const dna = useDna();
  const cm = coresDaMarca(dna.data);
  const t = template === "marca" ? estiloMarca(cm.principal, cm.destaque) : TEMPLATES[template] ?? TEMPLATES["wsa-neon"];
  const destaque = dados.cor_destaque ?? t.destaque;
  const fundo = useImagemMidia(dados.fundo_midia);
  const titulo = (tamanho: number): CSSProperties => ({
    fontFamily: t.fonteTitulo, fontSize: tamanho, lineHeight: 1.04, fontWeight: t.caixaAlta ? 900 : 800,
    textTransform: t.caixaAlta ? "uppercase" : "none", letterSpacing: t.caixaAlta ? "-0.01em" : "-0.02em",
  });
  const ed = { editavel, onCampo };
  const tamTitulo = dados.layout === "capa" ? (dados.titulo.length > 70 ? 84 : 104) : dados.titulo.length > 60 ? 64 : 76;

  return (
    <div
      ref={ref}
      style={{
        width: LARGURA, height: ALTURA, background: t.fundo(dados.cor_fundo), color: t.texto, fontFamily: SANS,
        padding: "84px 88px", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", boxSizing: "border-box",
      }}
    >
      {/* Imagem de fundo (gerada por IA ou do banco de mídias), com véu para o texto ficar legível */}
      {fundo && (
        <>
          <img src={fundo} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 35%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.8) 100%)" }} />
        </>
      )}

      {/* Marca */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, minHeight: 64, position: "relative" }}>
        {comLogo && (
          <>
            <img src={logo} alt="" style={{ width: 64, height: 64, objectFit: "contain", borderRadius: 14 }} />
            <div style={{ fontWeight: 900, fontSize: 30, letterSpacing: "0.02em", lineHeight: 1 }}>
              WSA<span style={{ display: "block", fontSize: 17, letterSpacing: "0.24em", fontWeight: 700, color: t.suave, marginTop: 6 }}>SISTEMAS IA</span>
            </div>
          </>
        )}
        {total > 1 && <div style={{ marginLeft: "auto", fontSize: 26, fontWeight: 700, color: t.suave }}>{n}/{total}</div>}
      </div>

      {/* Conteúdo */}
      <div
        style={{
          flex: 1, display: "flex", flexDirection: "column", gap: 40, paddingTop: 40, paddingBottom: 40, position: "relative",
          justifyContent: dados.posicao === "topo" ? "flex-start" : dados.posicao === "base" ? "flex-end" : "center",
          textAlign: dados.layout === "capa" || dados.layout === "cta" ? "center" : "left",
          alignItems: dados.layout === "capa" || dados.layout === "cta" ? "center" : "stretch",
        }}
      >
        <Texto campo="titulo" valor={dados.titulo} cor={destaque} como="h2" style={{ ...titulo(tamTitulo), margin: 0 }} {...ed} />
        {dados.texto && <Texto campo="texto" valor={dados.texto} cor={destaque} como="p" style={{ fontSize: 38, lineHeight: 1.35, color: t.suave, margin: 0 }} {...ed} />}

        {dados.layout === "lista" && dados.itens?.length ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 26 }}>
            {dados.itens.map((item, i) => (
              <li key={i} style={{ borderLeft: `8px solid ${destaque}`, paddingLeft: 30, fontSize: 40, fontWeight: 600, lineHeight: 1.25 }}>
                <Texto campo={`itens.${i}`} valor={item} cor={destaque} como="span" {...ed} />
              </li>
            ))}
          </ul>
        ) : null}

        {dados.layout === "grade" && dados.itens?.length ? (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${dados.itens.length > 4 ? 4 : 2}, 1fr)`, gap: 22 }}>
            {dados.itens.map((item, i) => {
              const Icone = iconeDo(item);
              return (
                <div key={i} style={{ background: t.cartao, border: "2px solid rgba(255,255,255,0.18)", borderRadius: 28, padding: "30px 14px", textAlign: "center", fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>
                  <Icone size={52} color={destaque} strokeWidth={2} style={{ display: "block", margin: "0 auto 16px" }} />
                  <Texto campo={`itens.${i}`} valor={item} cor={destaque} como="span" {...ed} />
                </div>
              );
            })}
          </div>
        ) : null}

        {dados.cta && (
          <Texto
            campo="cta" valor={dados.cta} cor={destaque} {...ed}
            style={{
              border: `5px solid ${destaque}`, borderRadius: 32, padding: dados.layout === "cta" ? "44px 48px" : "28px 40px",
              fontSize: dados.layout === "cta" ? 46 : 32, fontWeight: 800, lineHeight: 1.2, textTransform: "uppercase",
              boxShadow: `0 0 60px ${destaque}55`, alignSelf: "center", textAlign: "center",
            }}
          />
        )}
      </div>

      {/* Rodapé */}
      <div style={{ display: "flex", alignItems: "center", fontSize: 26, color: t.suave, fontWeight: 600 }}>
        <span>@wsasistemas.ia</span>
        {total > 1 && n < total && <span style={{ marginLeft: "auto", color: destaque }}>Arraste →</span>}
      </div>
    </div>
  );
});

/** Mostra o slide reduzido para caber em `largura` px, mantendo o HTML em tamanho real. */
export function SlideEscala({ largura, className, ...props }: PropsSlide & { largura: number; className?: string }) {
  const escala = largura / LARGURA;
  return (
    <div className={className} style={{ width: largura, height: ALTURA * escala, overflow: "hidden", position: "relative" }}>
      <div style={{ transform: `scale(${escala})`, transformOrigin: "top left", width: LARGURA, height: ALTURA }}>
        <Slide {...props} />
      </div>
    </div>
  );
}
