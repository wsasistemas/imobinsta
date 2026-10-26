import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { LoaderCircle, LockKeyhole, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tile } from "@/components/ui/tile";
import { useAcesso } from "./acesso";

function Aviso({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="pagina-entra w-full max-w-md rounded-hig-2xl bg-bg2 p-8 text-center shadow-hig">
        <div className="mb-4 flex justify-center">{icone}</div>
        <h2 className="mb-2">{titulo}</h2>
        <div className="text-sub text-label2">{children}</div>
      </div>
    </div>
  );
}

/** Só deixa passar quem está logado E é membro de uma conta do estúdio. */
export function Guarda({ children }: { children: ReactNode }) {
  const { estado, usuario, sair } = useAcesso();

  if (estado === "carregando") {
    return (
      <div className="grid min-h-screen place-items-center text-label2" role="status" aria-live="polite">
        <LoaderCircle className="size-7 animate-spin" aria-label="Carregando" />
      </div>
    );
  }
  if (estado === "sem_config") {
    return (
      <Aviso icone={<Tile icone={Settings2} cor="gray" tamanho="lg" />} titulo="Falta configurar o Supabase">
        Copie <code>app/.env.example</code> para <code>app/.env.local</code> e preencha a chave pública do projeto ikvj.
      </Aviso>
    );
  }
  if (estado === "sem_sessao") return <Navigate to="/entrar" replace />;
  if (estado === "sem_acesso") {
    return (
      <Aviso icone={<Tile icone={LockKeyhole} cor="orange" tamanho="lg" />} titulo="Sem acesso ao estúdio">
        <p>
          O login <b className="text-label">{usuario?.email}</b> existe, mas não está liberado no Estúdio imobinsta.
          Peça ao dono da conta para incluir você.
        </p>
        <Button variante="secundario" className="mt-6" onClick={sair}>
          Entrar com outro login
        </Button>
      </Aviso>
    );
  }
  return <>{children}</>;
}
