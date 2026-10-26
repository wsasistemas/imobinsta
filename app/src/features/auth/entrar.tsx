import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { CircleAlert, Instagram, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tile } from "@/components/ui/tile";
import { useAcesso } from "./acesso";

export function Entrar() {
  const { estado, entrar } = useAcesso();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
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
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(110%_90%_at_85%_0%,rgba(46,91,255,0.35),transparent_60%)] p-4">
      <form onSubmit={enviar} className="pagina-entra w-full max-w-[400px] rounded-hig-2xl bg-bg2 p-8 shadow-hig" noValidate>
        <div className="mb-6 flex items-center gap-3">
          <Tile icone={Instagram} cor="instagram" tamanho="lg" />
          <div>
            <h2>Estúdio imobinsta</h2>
            <p className="text-foot text-label2">WSA Sistemas de IA</p>
          </div>
        </div>

        <label htmlFor="email" className="mb-1.5 block text-foot text-label2">E-mail</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          className="campo"
          placeholder="seu@empresa.com.br"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="senha" className="mt-4 mb-1.5 block text-foot text-label2">Senha</label>
        <input
          id="senha"
          type="password"
          autoComplete="current-password"
          required
          className="campo"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />

        {erro && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-hig-md bg-red/15 px-3 py-2.5 text-foot text-red">
            <CircleAlert className="mt-px size-4 flex-none" /> {erro}
          </p>
        )}

        <Button type="submit" className="mt-6 w-full" disabled={enviando || !email || !senha}>
          {enviando && <LoaderCircle className="animate-spin" />} Entrar
        </Button>

        <p className="mt-5 text-center text-foot text-label2">
          O mesmo login vale nos outros sistemas da WSA.
        </p>
      </form>
    </div>
  );
}
