import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, supabaseSemConfig } from "@/lib/supabase";

export type Conta = { conta_id: string; nome: string; ig_username: string | null; papel: "dono" | "editor" };
export type EstadoAcesso = "carregando" | "sem_config" | "sem_sessao" | "sem_acesso" | "ok";

type Valor = {
  estado: EstadoAcesso;
  usuario: User | null;
  conta: Conta | null;
  demo: boolean;
  entrar: (email: string, senha: string) => Promise<string | null>;
  sair: () => Promise<void>;
};

const Ctx = createContext<Valor | null>(null);

/**
 * Modo demonstração: SÓ em desenvolvimento (`npm run dev`) e com ?demo=1 na URL.
 * Serve para conferir as telas sem login real. O build de produção remove este caminho
 * (import.meta.env.DEV é false).
 */
function modoDemo(): boolean {
  if (import.meta.env.DEV) {
    try {
      if (new URLSearchParams(location.search).get("demo") === "1") sessionStorage.setItem("imobinsta-demo", "1");
      return sessionStorage.getItem("imobinsta-demo") === "1";
    } catch {
      return false;
    }
  }
  return false;
}

const CONTA_DEMO: Conta = { conta_id: "00000000-0000-4000-a000-000000000001", nome: "WSA Sistemas de IA", ig_username: "wsasistemas.ia", papel: "dono" };

function traduzirErro(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(msg)) return "Confirme o seu e-mail antes de entrar.";
  if (/rate limit|too many/i.test(msg)) return "Muitas tentativas. Aguarde alguns minutos.";
  if (/fetch|network/i.test(msg)) return "Sem conexão com o servidor. Tente de novo.";
  return "Não foi possível entrar. Tente de novo.";
}

export function AcessoProvider({ children }: { children: ReactNode }) {
  const demo = useMemo(modoDemo, []);
  const [sessao, setSessao] = useState<Session | null>(null);
  const [conta, setConta] = useState<Conta | null>(null);
  const [estado, setEstado] = useState<EstadoAcesso>(demo ? "ok" : supabaseSemConfig ? "sem_config" : "carregando");

  const carregarConta = useCallback(async (s: Session | null) => {
    setSessao(s);
    if (!s) {
      setConta(null);
      setEstado("sem_sessao");
      return;
    }
    const { data, error } = await supabase.rpc("minhas_contas");
    const primeira = (data as Conta[] | null)?.[0] ?? null;
    setConta(primeira);
    setEstado(!error && primeira ? "ok" : "sem_acesso");
  }, []);

  useEffect(() => {
    if (demo || supabaseSemConfig) return;
    supabase.auth.getSession().then(({ data }) => carregarConta(data.session));
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === "SIGNED_IN" || evento === "SIGNED_OUT" || evento === "USER_UPDATED") carregarConta(s);
      else setSessao(s);
    });
    return () => data.subscription.unsubscribe();
  }, [demo, carregarConta]);

  const entrar = useCallback(async (email: string, senha: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    return error ? traduzirErro(error.message) : null;
  }, []);

  const sair = useCallback(async () => {
    if (import.meta.env.DEV && demo) {
      try { sessionStorage.removeItem("imobinsta-demo"); } catch { /* sem storage */ }
      location.href = "/entrar";
      return;
    }
    // scope "local": encerra só esta aba/navegador, sem derrubar o login dos outros sistemas WSA.
    await supabase.auth.signOut({ scope: "local" });
  }, [demo]);

  const valor: Valor = {
    estado,
    usuario: demo ? ({ email: "demonstracao@local" } as User) : (sessao?.user ?? null),
    conta: demo ? CONTA_DEMO : conta,
    demo,
    entrar,
    sair,
  };

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAcesso() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAcesso fora do AcessoProvider");
  return v;
}
