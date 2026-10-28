// Google (Fase 11): OAuth com o escopo drive.file e acesso ao Drive pelo refresh token guardado no Vault.
import { env, type Db } from "./comum.ts";

export const ESCOPO_DRIVE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export class ErroGoogle extends Error {
  constructor(mensagem: string, public codigo?: string) {
    super(mensagem);
  }
}

export function redirectGoogle() {
  return `${env("SUPABASE_URL")}/functions/v1/google-oauth`;
}

async function token(params: Record<string, string>) {
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), ...params }),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroGoogle(corpo.error_description ?? corpo.error ?? `HTTP ${r.status}`, corpo.error);
  return corpo as { access_token: string; expires_in: number; refresh_token?: string; scope?: string };
}

export function trocarCodigo(code: string) {
  return token({ code, redirect_uri: redirectGoogle(), grant_type: "authorization_code" });
}

/** Chamada à API do Drive v3 com o token de acesso. */
export async function drive<T = Record<string, unknown>>(accessToken: string, caminho: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://www.googleapis.com/drive/v3/${caminho}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroGoogle(corpo.error?.message ?? `Drive HTTP ${r.status}`);
  return corpo as T;
}

export async function conexaoGoogle(db: Db, contaId: string) {
  const { data, error } = await db.from("conexoes").select("id, status").eq("conta_id", contaId).eq("provedor", "google").single();
  if (error) throw new Error("A conexão Google não existe. Rode a migration 20261027090000_fase11_google.sql.");
  return data as { id: string; status: string };
}

/**
 * Token de acesso novo a partir do refresh token do Vault. Se o Google recusar (revogado ou vencido:
 * em modo de teste ele vale 7 dias), marca a conexão como expirada.
 */
export async function acessoGoogle(db: Db, contaId: string) {
  const conexao = await conexaoGoogle(db, contaId);
  const { data: refresh, error } = await db.rpc("ler_segredo_conexao", { p_conexao: conexao.id });
  if (error) throw error;
  if (!refresh) throw new ErroGoogle("O Google ainda não foi conectado.", "sem_token");
  try {
    return (await token({ refresh_token: refresh as string, grant_type: "refresh_token" })).access_token;
  } catch (e) {
    if (e instanceof ErroGoogle && e.codigo === "invalid_grant") {
      await db.from("conexoes").update({ status: "expirado", atualizado_em: new Date().toISOString() }).eq("id", conexao.id);
      throw new ErroGoogle("O acesso ao Google venceu ou foi revogado. Conecte de novo em Conexões.", "invalid_grant");
    }
    throw e;
  }
}
