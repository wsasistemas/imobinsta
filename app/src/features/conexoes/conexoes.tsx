import { useQuery } from "@tanstack/react-query";
import { Cpu, Instagram, PlugZap, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Card } from "@/components/ui/hig";
import { Tile, type CorTile } from "@/components/ui/tile";
import { supabase } from "@/lib/supabase";
import { useAcesso } from "@/features/auth/acesso";

type Provedor = "instagram" | "chatfyre" | "gemini" | "openai" | "heygen" | "fal";
type Status = "a_conectar" | "conectado" | "expirado" | "erro";
type Conexao = { provedor: Provedor; status: Status; detalhe: string | null; expira_em: string | null };

const VISUAL: Record<Provedor, { nome: string; icone: LucideIcon; cor: CorTile; pago: boolean }> = {
  instagram: { nome: "Instagram — API oficial", icone: Instagram, cor: "instagram", pago: false },
  chatfyre: { nome: "Chatfyre", icone: Zap, cor: "orange", pago: true },
  gemini: { nome: "Gemini", icone: Sparkles, cor: "indigo", pago: false },
  openai: { nome: "OpenAI", icone: Cpu, cor: "gray", pago: true },
  heygen: { nome: "HeyGen", icone: Cpu, cor: "purple", pago: true },
  fal: { nome: "fal.ai", icone: Cpu, cor: "gray", pago: true },
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

  const lista = [...(data ?? [])].sort((a, b) => ORDEM.indexOf(a.provedor) - ORDEM.indexOf(b.provedor));

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
                  </div>
                </Card>
              );
            })}
      </div>

      <p className="mt-4 text-foot text-label2">
        Chaves e tokens ficam no Vault do Supabase e só as Edge Functions os usam. Esta tela mostra apenas o status.
      </p>

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
