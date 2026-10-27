// Cliente do Chatfyre para as Edge Functions: MCP por HTTP (JSON-RPC) com Bearer e renovação do token.
//
// Credenciais da conta ficam no Vault (conexão "chatfyre") como JSON:
//   { client_id, client_secret?, refresh_token, access_token?, expira_em? }
// Vêm do script local `scripts/chatfyre-token.ps1 -Exportar` (o OAuth do Chatfyre só aceita o
// redirect do claude.ai, então o login não pode ser feito pelo estúdio).
import { z } from "npm:zod@3.25.76";
import type { Db } from "./comum.ts";

export const CHATFYRE_MCP = "https://chatfyre.com/api/mcp";
const TOKEN_URL = "https://chatfyre.com/api/oauth/mcp/token";
const PROTOCOLO = "2025-06-18";

export const Credenciais = z.object({
  client_id: z.string().min(1).max(500),
  client_secret: z.string().max(500).optional().nullable(),
  refresh_token: z.string().min(1).max(4000),
  access_token: z.string().max(8000).optional().nullable(),
  expira_em: z.string().max(40).optional().nullable(),
});
export type Credenciais = z.infer<typeof Credenciais>;

/** Erro que o usuário entende (status HTTP para a resposta da função). */
export class ErroChatfyre extends Error {
  constructor(mensagem: string, public status = 502) {
    super(mensagem);
  }
}
class TokenRecusado extends Error {}

export type Ferramenta = { name: string; description?: string; inputSchema?: unknown };

// ---------- Credenciais no Vault ---------------------------------------------------------------

export async function conexaoChatfyre(db: Db, contaId: string) {
  const { data, error } = await db.from("conexoes").select("id").eq("conta_id", contaId).eq("provedor", "chatfyre").maybeSingle();
  if (error) throw error;
  if (data) return data.id as string;
  const { data: nova, error: eIns } = await db.from("conexoes").insert({ conta_id: contaId, provedor: "chatfyre" }).select("id").single();
  if (eIns) throw eIns;
  return nova.id as string;
}

async function lerCredenciais(db: Db, conexaoId: string): Promise<Credenciais> {
  const { data } = await db.rpc("ler_segredo_conexao", { p_conexao: conexaoId });
  const v = typeof data === "string" ? Credenciais.safeParse(JSON.parse(data)) : null;
  if (!v?.success) throw new ErroChatfyre("Chatfyre não conectado ao estúdio. Cole o pacote do script em Conexões e custos.", 409);
  return v.data;
}

export async function salvarCredenciais(db: Db, conexaoId: string, c: Credenciais) {
  const { error } = await db.rpc("salvar_segredo_conexao", { p_conexao: conexaoId, p_valor: JSON.stringify(c) });
  if (error) throw error;
}

async function marcarExpirado(db: Db, conexaoId: string) {
  await db.from("conexoes").update({
    status: "expirado",
    detalhe: "O Chatfyre recusou o login do estúdio. Gere um pacote novo com o script e cole em Conexões.",
    atualizado_em: new Date().toISOString(),
  }).eq("id", conexaoId);
}

/** Troca o refresh token por um access token novo. O Chatfyre pode girar o refresh token. */
export async function renovar(c: Credenciais): Promise<Credenciais> {
  const corpo = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: c.refresh_token,
    client_id: c.client_id,
    resource: CHATFYRE_MCP,
  });
  if (c.client_secret) corpo.set("client_secret", c.client_secret);
  const resp = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: corpo });
  const r = await resp.json().catch(() => ({}));
  if (!resp.ok || !r.access_token) {
    if (resp.status === 400 || resp.status === 401) throw new TokenRecusado(r.error_description ?? r.error ?? `HTTP ${resp.status}`);
    throw new ErroChatfyre(`O Chatfyre não renovou o acesso (HTTP ${resp.status}). Tente de novo em instantes.`);
  }
  return {
    ...c,
    access_token: r.access_token,
    refresh_token: r.refresh_token ?? c.refresh_token,
    expira_em: new Date(Date.now() + (Number(r.expires_in) || 3600) * 1000).toISOString(),
  };
}

function valido(c: Credenciais) {
  return !!c.access_token && !!c.expira_em && new Date(c.expira_em).getTime() > Date.now() + 60_000;
}

// ---------- JSON-RPC (MCP Streamable HTTP) ------------------------------------------------------

type Resposta = { id?: number; result?: unknown; error?: { code: number; message: string } };

/** A resposta pode vir como JSON ou como SSE (linhas "data: {...}"). */
function lerMensagens(tipo: string, texto: string): Resposta[] {
  if (tipo.includes("text/event-stream")) {
    return texto
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => { try { return JSON.parse(l.slice(5).trim()); } catch { return null; } })
      .filter(Boolean);
  }
  if (!texto.trim()) return [];
  const v = JSON.parse(texto);
  return Array.isArray(v) ? v : [v];
}

class Sessao {
  private sessao: string | null = null;
  private seq = 0;
  constructor(private token: string) {}

  private async enviar(metodo: string, params: unknown, notificacao = false) {
    const id = notificacao ? undefined : ++this.seq;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.sessao) headers["Mcp-Session-Id"] = this.sessao;
    if (metodo !== "initialize") headers["MCP-Protocol-Version"] = PROTOCOLO;
    const resp = await fetch(CHATFYRE_MCP, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", ...(id ? { id } : {}), method: metodo, ...(params ? { params } : {}) }),
    });
    if (resp.status === 401) throw new TokenRecusado("401");
    const texto = await resp.text();
    if (!resp.ok) throw new ErroChatfyre(`Chatfyre respondeu ${resp.status} em ${metodo}: ${texto.slice(0, 300)}`);
    this.sessao = resp.headers.get("mcp-session-id") ?? this.sessao;
    if (notificacao) return undefined;
    const msg = lerMensagens(resp.headers.get("content-type") ?? "", texto).find((m) => m.id === id);
    if (!msg) throw new ErroChatfyre(`Chatfyre não respondeu ${metodo}.`);
    if (msg.error) throw new ErroChatfyre(`Chatfyre: ${msg.error.message}`);
    return msg.result;
  }

  async iniciar() {
    const r = (await this.enviar("initialize", {
      protocolVersion: PROTOCOLO,
      capabilities: {},
      clientInfo: { name: "imobinsta-estudio", version: "1.0" },
    })) as { serverInfo?: { name?: string } };
    await this.enviar("notifications/initialized", undefined, true);
    return r;
  }

  async ferramentas(): Promise<Ferramenta[]> {
    const r = (await this.enviar("tools/list", {})) as { tools?: Ferramenta[] };
    return r.tools ?? [];
  }

  /** Chama a ferramenta e devolve o JSON do texto da resposta (ou o texto puro). */
  async chamar(nome: string, argumentos: Record<string, unknown> = {}): Promise<unknown> {
    const r = (await this.enviar("tools/call", { name: nome, arguments: argumentos })) as {
      content?: { type: string; text?: string }[]; structuredContent?: unknown; isError?: boolean;
    };
    const texto = (r.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
    if (r.isError) throw new ErroChatfyre(`Chatfyre (${nome}): ${texto.slice(0, 400) || "erro sem detalhe"}`, 422);
    if (r.structuredContent !== undefined) return r.structuredContent;
    try { return JSON.parse(texto); } catch { return texto; }
  }
}

/**
 * Abre uma sessão MCP já autenticada para a conta e executa `fn`.
 * Renova o token quando vence ou quando o Chatfyre devolve 401 (uma vez), e salva o novo no Vault.
 */
export async function comChatfyre<T>(db: Db, contaId: string, fn: (s: Sessao) => Promise<T>): Promise<T> {
  const conexaoId = await conexaoChatfyre(db, contaId);
  let c = await lerCredenciais(db, conexaoId);
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      if (tentativa > 0 || !valido(c)) {
        c = await renovar(c);
        await salvarCredenciais(db, conexaoId, c);
      }
      const s = new Sessao(c.access_token!);
      await s.iniciar();
      return await fn(s);
    } catch (e) {
      if (!(e instanceof TokenRecusado)) throw e;
      if (tentativa === 1 || e.message !== "401") {
        await marcarExpirado(db, conexaoId);
        throw new ErroChatfyre("O Chatfyre recusou o login do estúdio. Gere um pacote novo com o script e cole em Conexões.", 409);
      }
    }
  }
  throw new ErroChatfyre("Falha inesperada no Chatfyre.");
}

/** Testa um pacote novo de credenciais sem depender do Vault. Devolve as credenciais (talvez renovadas). */
export async function testarCredenciais(c: Credenciais) {
  let atual = c;
  if (!valido(atual)) {
    try {
      atual = await renovar(atual);
    } catch (e) {
      if (e instanceof TokenRecusado) throw new ErroChatfyre(`O Chatfyre recusou o pacote (${e.message}). Rode o script de novo.`, 400);
      throw e;
    }
  }
  const s = new Sessao(atual.access_token!);
  try {
    const info = await s.iniciar();
    const ferramentas = await s.ferramentas();
    let conta: unknown = null;
    if (ferramentas.some((f) => f.name === "status_da_conta")) conta = await s.chamar("status_da_conta").catch(() => null);
    return { credenciais: atual, info, ferramentas, conta };
  } catch (e) {
    if (e instanceof TokenRecusado) throw new ErroChatfyre("O Chatfyre recusou o token do pacote. Rode o script de novo.", 400);
    throw e;
  }
}

export type { Sessao };
