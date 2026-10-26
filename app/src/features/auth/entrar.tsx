import { useState, type FormEvent, type ReactNode } from "react";
import { Navigate } from "react-router";
import { Eye, EyeOff, Instagram, LoaderCircle, Lock, Mail, MousePointerClick, TriangleAlert, Wallet } from "lucide-react";
import wsaLogo from "@/assets/wsa-logo.png";
import { Tile, type CorTile } from "@/components/ui/tile";
import type { LucideIcon } from "lucide-react";
import { useAcesso } from "./acesso";
import { CenaInstagram } from "./cena-instagram";
import "./entrada.css";

// Entrada no mesmo design system do Imobdisparos (Imobenviomassa/src/components/login-layout.tsx):
// cena ilustrada à esquerda sob o véu, texto grande na frente, números na base; formulário claro à direita.

const ANO = new Date().getFullYear();
const CHAVE_EMAIL = "imobinsta-email-lembrado";

function lerEmailLembrado(): string {
  try {
    return localStorage.getItem(CHAVE_EMAIL) ?? "";
  } catch {
    return "";
  }
}
function guardarEmail(email: string) {
  try {
    if (email) localStorage.setItem(CHAVE_EMAIL, email);
    else localStorage.removeItem(CHAVE_EMAIL);
  } catch {
    /* navegador sem storage: não lembra */
  }
}

function Numero({ icone, cor, valor, rotulo }: { icone: LucideIcon; cor: CorTile; valor: string; rotulo: string }) {
  return (
    <li>
      <span>
        <Tile icone={icone} cor={cor} className="size-8 rounded-lg [&_svg]:size-[18px]" />
      </span>
      <b>{valor}</b>
      <small>{rotulo}</small>
    </li>
  );
}

function Campo({ id, rotulo, icone, acao, children }: { id: string; rotulo: string; icone: ReactNode; acao?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="ent-rotulo">{rotulo}</label>
      <div className="ent-campo">
        <span className="ent-icone">{icone}</span>
        {children}
        {acao && <span className="ent-acao">{acao}</span>}
      </div>
    </div>
  );
}

export function Entrar() {
  const { estado, entrar } = useAcesso();
  const [email, setEmail] = useState(lerEmailLembrado);
  const [lembrar, setLembrar] = useState(() => lerEmailLembrado() !== "");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (estado === "ok") return <Navigate to="/" replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const falha = await entrar(email, senha);
    setEnviando(false);
    if (falha) setErro(falha);
    else guardarEmail(lembrar ? email.trim() : "");
  }

  return (
    <div className="mpl-root">
      {/* ===== Painel da esquerda: o objetivo do estúdio ===== */}
      <aside className="mpl-visual" aria-label="Estúdio imobinsta · WSA Sistemas">
        <CenaInstagram className="absolute inset-0" />
        <div className="mpl-scrim" aria-hidden="true" />

        <div className="mpl-brand">
          <span className="mpl-mark">
            <img src={wsaLogo} alt="" width={44} height={44} />
          </span>
          <span className="mpl-brand__nome">
            Estúdio imobinsta
            <small>WSA Sistemas</small>
          </span>
        </div>

        <div className="mpl-pitch">
          <span className="mpl-tag">Conteúdo e vendas no Instagram</span>
          <h1 className="mpl-titulo">Post que vira seguidor e cliente.</h1>
          <p className="mpl-texto">
            Crie posts, carrosséis e Reels com IA, publique no Instagram e deixe a automação responder quem comenta —
            direto no direct, com o link certo.
          </p>
        </div>

        <ul className="mpl-metrics">
          <Numero icone={Instagram} cor="instagram" valor="4 formatos" rotulo="Post · Carrossel · Reels" />
          <Numero icone={MousePointerClick} cor="orange" valor="1 clique" rotulo="Publica + automação" />
          <Numero icone={Wallet} cor="green" valor="R$ 0" rotulo="Sem mensalidade" />
        </ul>
      </aside>

      {/* ===== Acesso (direita, sempre claro) ===== */}
      <main className="mpl-panel">
        <div className="mpl-panel__conteudo">
          <div>
            <p className="mpl-kicker">Acesso do colaborador</p>
            <h2 className="mpl-entrar">Entrar</h2>
            <p className="mpl-sub">Acesse o estúdio com o seu e-mail.</p>

            <form onSubmit={enviar} noValidate className="mpl-form">
              {erro && (
                <div role="alert" className="ent-aviso">
                  <TriangleAlert size={20} strokeWidth={2.2} className="mt-px shrink-0" aria-hidden="true" />
                  <span>{erro}</span>
                </div>
              )}

              <Campo id="login-email" rotulo="E-mail" icone={<Mail size={16} strokeWidth={2} aria-hidden="true" />}>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  placeholder="voce@suaempresa.com.br"
                  autoFocus={!email}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErro(null);
                  }}
                  className="ent-input"
                />
              </Campo>

              <Campo
                id="login-senha"
                rotulo="Senha"
                icone={<Lock size={16} strokeWidth={2} aria-hidden="true" />}
                acao={
                  <button
                    type="button"
                    onClick={() => setVerSenha((v) => !v)}
                    aria-controls="login-senha"
                    aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
                    className="ent-olho"
                  >
                    {verSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              >
                <input
                  id="login-senha"
                  type={verSenha ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  autoFocus={!!email}
                  value={senha}
                  onChange={(e) => {
                    setSenha(e.target.value);
                    setErro(null);
                  }}
                  className="ent-input pr-[52px]"
                />
              </Campo>

              <label className="ent-lembrar">
                <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
                Lembrar meu e-mail
              </label>

              <button type="submit" disabled={enviando || !email || !senha} className="ent-botao">
                <span className="inline-flex items-center gap-2">
                  {enviando && <LoaderCircle className="size-4 animate-spin" />}
                  {enviando ? "Entrando…" : "Entrar"}
                </span>
              </button>

              <p className="mpl-note">
                O acesso é liberado pelo dono da conta no estúdio. O mesmo login vale nos outros sistemas da WSA.
              </p>
            </form>
          </div>
        </div>
        <p className="mpl-legal">© {ANO} WSA Sistemas. Todos os direitos reservados.</p>
      </main>
    </div>
  );
}
