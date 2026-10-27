// Utilidades das Edge Functions do imobinsta. Chaves só via Deno.env (secrets do Supabase).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.50.0";

export const GRAPH = "https://graph.facebook.com/v25.0";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

export function env(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Secret ${nome} não configurado no Supabase`);
  return v;
}

// deno-lint-ignore no-explicit-any
export type Db = SupabaseClient<any, "imobinsta", any>;

/** Cliente com service_role apontando para o schema imobinsta. Nunca sai do servidor. */
export function admin(): Db {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    db: { schema: "imobinsta" },
    auth: { persistSession: false },
  });
}

/** Usuário do JWT da requisição, ou null. */
export async function usuario(req: Request, db: Db) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  return data.user ?? null;
}

/** true se a requisição veio com a service_role (pg_cron). */
export function ehServico(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  return !!token && token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

export async function papelNaConta(db: Db, contaId: string, userId: string) {
  const { data } = await db
    .from("membros")
    .select("papel")
    .eq("conta_id", contaId)
    .eq("user_id", userId)
    .eq("ativo", true)
    .maybeSingle();
  return (data?.papel as "dono" | "editor" | undefined) ?? null;
}

export class ErroGraph extends Error {
  constructor(public codigo: number | undefined, mensagem: string) {
    super(mensagem);
  }
  /** Token inválido ou expirado (código 190 da Graph API). */
  get tokenInvalido() {
    return this.codigo === 190;
  }
}

/** GET na Graph API. O token vai na query, nunca em log. */
export async function graph<T = Record<string, unknown>>(caminho: string, params: Record<string, string>): Promise<T> {
  const url = caminho.startsWith("http") ? new URL(caminho) : new URL(`${GRAPH}/${caminho.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await fetch(url);
  const corpo = await resp.json().catch(() => ({}));
  if (!resp.ok || corpo.error) {
    throw new ErroGraph(corpo.error?.code, corpo.error?.message ?? `Graph API respondeu ${resp.status}`);
  }
  return corpo as T;
}

/** Linha de conexão do Instagram da conta (criada na migration da Fase 1). */
export async function conexaoInstagram(db: Db, contaId: string) {
  const { data, error } = await db
    .from("conexoes")
    .select("id, status")
    .eq("conta_id", contaId)
    .eq("provedor", "instagram")
    .single();
  if (error) throw error;
  return data as { id: string; status: string };
}
