import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { Check, ChevronLeft, Copy, ExternalLink, Instagram, LoaderCircle } from "lucide-react";
import { useAcesso } from "@/features/auth/acesso";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/layout/page-header";
import { Button, botao } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/hig";
import { cn } from "@/lib/utils";

const REDIRECT_URI = "https://ikvjaowvpvxojvcfwnct.supabase.co/functions/v1/ig-oauth";
const PAGINA_FB = "https://www.facebook.com/profile.php?id=61595954939588";
const PERMISSOES = [
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "instagram_manage_comments",
  "pages_show_list",
  "pages_read_engagement",
];

type Item = { id: string; texto: ReactNode };
type Etapa = { titulo: string; resumo: string; link?: { rotulo: string; url: string }; itens: Item[]; extra?: ReactNode };

/** Campo somente leitura com botão de copiar. */
function Copiavel({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="mt-3 flex items-center gap-2 rounded-hig-md bg-fill3 py-1 pl-3 pr-1">
      <code className="min-w-0 flex-1 truncate text-foot" title={valor}>{valor}</code>
      <Button
        variante="simples"
        tamanho="sm"
        aria-label={`Copiar ${rotulo}`}
        onClick={() => {
          navigator.clipboard.writeText(valor).then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1600);
          });
        }}
      >
        {copiado ? <Check /> : <Copy />}
        {copiado ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}

const ETAPAS: Etapa[] = [
  {
    titulo: "Conferir a conta",
    resumo: "A @wsasistemas.ia precisa ser profissional e estar ligada à Página do Facebook.",
    link: { rotulo: "Abrir a Página", url: PAGINA_FB },
    itens: [
      { id: "0a", texto: <>No Instagram, em <b>Configurações → Tipo de conta e ferramentas</b>, a conta é <b>Comercial</b> ou <b>Criador de conteúdo</b>.</> },
      { id: "0b", texto: <>Na <b>Central de Contas</b>, a Página aparece vinculada à @wsasistemas.ia.</> },
      { id: "0c", texto: <>Seu Facebook pessoal tem <b>controle total</b> da Página (Configurações → Acesso à Página).</> },
    ],
  },
  {
    titulo: "Criar o app na Meta",
    resumo: "Feito no site da Meta: ela não permite criar app de outro lugar.",
    link: { rotulo: "Abrir Meta for Developers", url: "https://developers.facebook.com/apps" },
    itens: [
      { id: "1a", texto: <>Entre com o Facebook que administra a Página. No primeiro acesso, faça o <b>cadastro de desenvolvedor</b>.</> },
      { id: "1b", texto: <>Clique em <b>Criar app</b>, nome <code>imobinsta</code>.</> },
      { id: "1c", texto: <>Caso de uso: <b>Gerenciar mensagens e conteúdo no Instagram</b>.</> },
      { id: "1d", texto: <>Empresa: o portfólio da WSA, se existir. Senão, “Ainda não quero conectar um portfólio”. Clique em <b>Criar app</b>.</> },
    ],
  },
  {
    titulo: "Escolher o login do Facebook",
    resumo: "O app aceita só um caminho. Use o do Facebook: só ele tem busca por hashtag (radar).",
    itens: [
      { id: "2a", texto: <>Em <b>Painel</b>, clique em <b>Personalizar o caso de uso Gerenciar mensagens e conteúdo no Instagram</b>.</> },
      { id: "2b", texto: <>No menu da esquerda, escolha <b>Configuração da API com login do Facebook</b>. Não use o de login do Instagram.</> },
      { id: "2c", texto: <>Clique em <b>Adicionar todas as permissões necessárias</b>.</> },
      { id: "2d", texto: <>Em <b>Permissões e recursos</b>, adicione <code>instagram_manage_insights</code>, <code>instagram_manage_comments</code> e o recurso <b>Instagram Public Content Access</b>.</> },
      { id: "2e", texto: <>Não adicione <code>instagram_manage_messages</code> nem webhooks: as DMs continuam no Chatfyre.</> },
    ],
    extra: (
      <div className="mt-4">
        <p className="text-foot text-label2">Permissões que o app deve ter no final:</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PERMISSOES.map((p) => <Badge key={p} tom="info">{p}</Badge>)}
        </div>
      </div>
    ),
  },
  {
    titulo: "Configurar o Facebook Login for Business",
    resumo: "Diz para a Meta para onde devolver você depois de autorizar.",
    itens: [
      { id: "3a", texto: <>Em <b>Concluir configuração</b>, abra <b>Configurar o Login do Facebook para Empresas</b>.</> },
      { id: "3b", texto: <>Em <b>URIs de redirecionamento do OAuth válidos</b>, cole o endereço abaixo e salve.</> },
      { id: "3c", texto: <>Em <b>Configurações</b>, clique em <b>Criar configuração</b>: nome <code>imobinsta-estudio</code>, token de <b>acesso do usuário</b>, ativos <b>Páginas</b> e <b>Contas do Instagram</b>, mesmas permissões da etapa anterior.</> },
      { id: "3d", texto: <>Anote o <b>ID da configuração</b>.</> },
    ],
    extra: <Copiavel valor={REDIRECT_URI} rotulo="endereço de redirecionamento" />,
  },
  {
    titulo: "Dados básicos do app",
    resumo: "Em Configurações do app → Básico.",
    itens: [
      { id: "4a", texto: <><b>URL da Política de Privacidade</b> (uma página da WSA).</> },
      { id: "4b", texto: <>Categoria <b>Negócios e páginas</b> e ícone com o logo da WSA (1024×1024). Salve.</> },
    ],
  },
  {
    titulo: "Guardar as chaves no Supabase",
    resumo: "As chaves ficam só no servidor. O estúdio nunca as mostra nem as guarda no navegador.",
    link: { rotulo: "Abrir secrets do Supabase", url: "https://supabase.com/dashboard/project/ikvjaowvpvxojvcfwnct/functions/secrets" },
    itens: [
      { id: "5a", texto: <>Crie o secret <code>META_APP_ID</code> com o <b>ID do app</b> (topo do painel da Meta).</> },
      { id: "5b", texto: <>Crie o secret <code>META_CONFIG_ID</code> com o <b>ID da configuração</b>.</> },
      { id: "5c", texto: <>Crie o secret <code>META_APP_SECRET</code> com a <b>Chave secreta do app</b> (Básico → Mostrar). Não cole essa chave em nenhum chat.</> },
      { id: "5d", texto: <>Deixe o app em <b>modo de Desenvolvimento</b>. Para a sua própria conta, não precisa de análise da Meta.</> },
    ],
  },
];

const CHAVE = "imobinsta-guia-instagram";

function lerFeitos(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHAVE) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Guia da Fase 2: criar o app da Meta e deixar o estúdio pronto para conectar o Instagram. */
export function ConfigurarInstagram() {
  const { demo, conta } = useAcesso();
  const [params] = useSearchParams();
  const retorno = { ok: params.get("ok") === "1", erro: params.get("erro") };
  const [conectando, setConectando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [feitos, setFeitos] = useState(lerFeitos);

  async function conectar() {
    setConectando(true);
    setFalha(null);
    const { data, error } = await supabase.functions.invoke<{ url?: string; erro?: string }>("ig-oauth", {
      body: { conta_id: conta!.conta_id },
    });
    if (data?.url) {
      window.location.assign(data.url);
      return;
    }
    let msg = data?.erro;
    if (!msg && error && "context" in error) msg = (await (error.context as Response).json().catch(() => null))?.erro;
    setFalha(msg ?? "Não foi possível falar com o servidor. Confira se a ig-oauth foi publicada.");
    setConectando(false);
  }

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify([...feitos]));
    } catch {
      /* navegador sem armazenamento: o progresso só não fica salvo */
    }
  }, [feitos]);

  const total = ETAPAS.reduce((n, e) => n + e.itens.length, 0);
  const pronto = feitos.size >= total;

  function alternar(id: string) {
    setFeitos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  return (
    <section className="pagina-entra mx-auto max-w-3xl">
      <Link to="/conexoes" className={cn(botao({ variante: "simples", tamanho: "sm" }), "-ml-3 mb-4")}>
        <ChevronLeft /> Conexões e custos
      </Link>
      <PageHeader
        titulo="Conectar o Instagram"
        subtitulo="Crie o app da Meta uma vez. Depois a conexão é um clique."
        icone={Instagram}
        cor="instagram"
      />

      <Card className="mb-6 flex flex-wrap items-center gap-4 p-5">
        <div className="min-w-0 flex-1">
          <b className="text-sub font-semibold">{feitos.size} de {total} passos feitos</b>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fill3" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={feitos.size}>
            <div className="h-full rounded-full bg-green transition-[width] duration-300" style={{ width: `${(feitos.size / total) * 100}%` }} />
          </div>
        </div>
        <Button onClick={conectar} disabled={conectando || demo || conta?.papel !== "dono"}>
          {conectando ? <LoaderCircle className="animate-spin" /> : <Instagram />} Conectar Instagram
        </Button>
      </Card>

      {(retorno.ok || retorno.erro || falha) && (
        <Card role="status" className={cn("mb-6 p-5 text-sub", retorno.ok ? "text-green" : "text-red")}>
          {retorno.ok ? "Instagram conectado. Os posts e métricas já podem ser sincronizados em Conexões e custos." : (falha ?? retorno.erro)}
        </Card>
      )}

      <ol className="grid gap-4">
        {ETAPAS.map((etapa, i) => {
          const feitasAqui = etapa.itens.filter((it) => feitos.has(it.id)).length;
          const completa = feitasAqui === etapa.itens.length;
          return (
            <li key={etapa.titulo}>
              <Card className="p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    className={cn(
                      "grid size-8 flex-none place-items-center rounded-full text-foot font-bold",
                      completa ? "bg-green text-white" : "bg-fill2 text-label2",
                    )}
                    aria-hidden
                  >
                    {completa ? <Check className="size-4" /> : i}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-body font-semibold">{etapa.titulo}</h2>
                    <p className="mt-0.5 text-foot text-label2">{etapa.resumo}</p>
                  </div>
                  {etapa.link && (
                    <a href={etapa.link.url} target="_blank" rel="noreferrer" className={botao({ variante: "secundario", tamanho: "sm" })}>
                      {etapa.link.rotulo} <ExternalLink />
                    </a>
                  )}
                </div>

                <ul className="mt-4 grid gap-1">
                  {etapa.itens.map((it) => (
                    <li key={it.id}>
                      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-hig-md px-2 py-2 hover:bg-fill3">
                        <input
                          type="checkbox"
                          checked={feitos.has(it.id)}
                          onChange={() => alternar(it.id)}
                          className="mt-0.5 size-5 flex-none accent-[var(--green)]"
                        />
                        <span className={cn("text-sub", feitos.has(it.id) && "text-label2 line-through")}>{it.texto}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                {etapa.extra}
              </Card>
            </li>
          );
        })}
      </ol>

      <p className="mt-6 text-foot text-label2">
        {pronto
          ? "Tudo pronto do seu lado. Clique em Conectar Instagram e autorize a Página e a @wsasistemas.ia na tela da Meta."
          : "O progresso fica salvo neste navegador."}
      </p>
    </section>
  );
}
