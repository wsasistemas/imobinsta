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

export const PASTA = "application/vnd.google-apps.folder";
type Arquivo = { id: string; name: string; webViewLink?: string };

/** Cria um arquivo (ou pasta, sem conteúdo) no Drive. Upload multipart: metadados + bytes numa só chamada. */
export async function criarNoDrive(
  accessToken: string,
  meta: { name: string; parents?: string[]; mimeType?: string },
  conteudo?: { bytes: Uint8Array<ArrayBuffer> | string; mime: string },
): Promise<Arquivo> {
  const campos = "id,name,webViewLink";
  let r: Response;
  if (!conteudo) {
    r = await fetch(`https://www.googleapis.com/drive/v3/files?fields=${campos}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(meta),
    });
  } else {
    const limite = "imobinsta" + crypto.randomUUID().replaceAll("-", "");
    const corpo = new Blob([
      `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${limite}\r\nContent-Type: ${conteudo.mime}\r\n\r\n`,
      conteudo.bytes,
      `\r\n--${limite}--`,
    ]);
    r = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${campos}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${limite}` },
      body: corpo,
    });
  }
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroGoogle(json.error?.message ?? `Drive HTTP ${r.status}`);
  return json as Arquivo;
}

/** Pasta pelo nome dentro de outra (ou na raiz). Com drive.file só aparecem as que o estúdio criou. */
export async function pastaGarantida(accessToken: string, nome: string, pai?: string): Promise<Arquivo> {
  const q = [`name = '${nome.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`, `mimeType = '${PASTA}'`, "trashed = false", pai ? `'${pai}' in parents` : "'root' in parents"];
  const { files } = await drive<{ files: Arquivo[] }>(accessToken, "files", { q: q.join(" and "), fields: "files(id,name,webViewLink)", pageSize: "1" });
  return files[0] ?? (await criarNoDrive(accessToken, { name: nome, mimeType: PASTA, parents: pai ? [pai] : undefined }));
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
