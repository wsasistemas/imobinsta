// chatfyre — ponte do estúdio com o Chatfyre (MCP por HTTP). O front nunca fala com o Chatfyre.
//
// POST { acao, conta_id, ... } com JWT de um membro da conta:
//   credenciais { pacote }  (só o dono)  → testa o pacote do script, guarda no Vault e lista as ferramentas
//   diagnostico {}                       → status da conta no Chatfyre + ferramentas disponíveis
//   ler { ferramenta, argumentos? }      → só ferramentas de leitura (lista fechada abaixo)
//   automacao_criar { post_id }          → cria de novo a automação de um post publicado (pausada, com media_id)
//   automacao_status { automacao_id, ativa } (só o dono) → ativa (publica o fluxo) ou pausa, depois da confirmação na tela
//
// A criação normal acontece no ig-publicar, logo depois de publicar. Regras em _shared/automacao.ts.
// Publicar com:  supabase functions deploy chatfyre
import { z } from "npm:zod@3.25.76";
import { admin, CORS, json, papelNaConta, usuario } from "../_shared/comum.ts";
import {
  comChatfyre, conexaoChatfyre, Credenciais, ErroChatfyre, type Ferramenta, salvarCredenciais, testarCredenciais,
} from "../_shared/chatfyre.ts";
import { criarAutomacaoDoPost, definirStatus } from "../_shared/automacao.ts";

const LEITURA = new Set(["status_da_conta", "listar_posts", "listar_automacoes", "metricas", "metricas_do_fluxo", "ver_fila", "ver_fluxo"]);
const ESCRITA = ["criar_automacao", "atualizar_automacao", "montar_fluxo", "definir_status_automacao", "duplicar_automacao"];

function resumo(ferramentas: Ferramenta[]) {
  return ferramentas.map((f) => ({ nome: f.name, descricao: f.description ?? "", parametros: f.inputSchema ?? null }));
}

/** Pacote = base64 do JSON gerado pelo script (ou o JSON direto). */
function lerPacote(bruto: unknown) {
  const texto = z.string().trim().min(20).max(20000).parse(bruto);
  let obj: unknown;
  try {
    obj = JSON.parse(texto.startsWith("{") ? texto : new TextDecoder().decode(Uint8Array.from(atob(texto), (c) => c.charCodeAt(0))));
  } catch {
    throw new ErroChatfyre("Pacote ilegível. Cole exatamente o que o script copiou.", 400);
  }
  const v = Credenciais.safeParse(obj);
  if (!v.success) throw new ErroChatfyre("Pacote incompleto: faltam client_id ou refresh_token. Rode o script de novo.", 400);
  return v.data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST." }, 405);
  const db = admin();
  try {
    const user = await usuario(req, db);
    if (!user) return json({ erro: "Faça login de novo." }, 401);
    const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const contaId = corpo.conta_id;
    if (typeof contaId !== "string") return json({ erro: "conta_id ausente" }, 400);
    const papel = await papelNaConta(db, contaId, user.id);
    if (!papel) return json({ erro: "Sem acesso a esta conta." }, 403);

    switch (corpo.acao) {
      case "credenciais": {
        if (papel !== "dono") return json({ erro: "Só o dono da conta pode conectar o Chatfyre." }, 403);
        const teste = await testarCredenciais(lerPacote(corpo.pacote));
        const conexaoId = await conexaoChatfyre(db, contaId);
        await salvarCredenciais(db, conexaoId, teste.credenciais);
        const nomes = teste.ferramentas.map((f) => f.name);
        const escrita = ESCRITA.filter((n) => nomes.includes(n));
        const usuarioIg = (teste.conta as { usuario?: string } | null)?.usuario;
        const validade = (teste.conta as { token_valido_ate?: string } | null)?.token_valido_ate;
        const { error } = await db.from("conexoes").update({
          status: "conectado",
          detalhe: `${usuarioIg ?? "Conta Chatfyre"} · ${nomes.length} ferramentas · ${escrita.length ? "cria automações" : "só leitura"}`,
          expira_em: null,
          atualizado_em: new Date().toISOString(),
        }).eq("id", conexaoId);
        if (error) throw error;
        console.log("chatfyre credenciais ok:", nomes.join(","), validade ?? "");
        return json({ ok: true, conta: teste.conta, escrita, ferramentas: resumo(teste.ferramentas) });
      }
      case "diagnostico": {
        const r = await comChatfyre(db, contaId, async (s) => {
          const ferramentas = await s.ferramentas();
          const conta = ferramentas.some((f) => f.name === "status_da_conta") ? await s.chamar("status_da_conta") : null;
          return { conta, ferramentas: resumo(ferramentas) };
        });
        return json(r);
      }
      case "ler": {
        const ferramenta = z.string().parse(corpo.ferramenta);
        if (!LEITURA.has(ferramenta)) return json({ erro: `Ferramenta não liberada para leitura: ${ferramenta}` }, 400);
        const argumentos = z.record(z.unknown()).optional().parse(corpo.argumentos) ?? {};
        return json({ resultado: await comChatfyre(db, contaId, (s) => s.chamar(ferramenta, argumentos)) });
      }
      case "automacao_criar": {
        const postId = z.string().uuid().parse(corpo.post_id);
        const { data: post } = await db.from("posts").select("status").eq("id", postId).eq("conta_id", contaId).maybeSingle();
        if (!post) return json({ erro: "Post não encontrado nesta conta." }, 404);
        if (post.status !== "publicado") return json({ erro: "A automação só é criada para post publicado." }, 409);
        const r = await criarAutomacaoDoPost(db, postId);
        if (!r) return json({ erro: "Este post não pediu automação." }, 409);
        return json(r, r.status === "erro" ? 422 : 200);
      }
      case "automacao_status": {
        if (papel !== "dono") return json({ erro: "Só o dono da conta ativa ou pausa automações." }, 403);
        const automacaoId = z.string().uuid().parse(corpo.automacao_id);
        const ativa = z.boolean().parse(corpo.ativa);
        return json(await definirStatus(db, contaId, automacaoId, ativa));
      }
      default:
        return json({ erro: "Ação desconhecida." }, 400);
    }
  } catch (e) {
    if (e instanceof ErroChatfyre) return json({ erro: e.message }, e.status);
    if (e instanceof z.ZodError) return json({ erro: `Dados inválidos: ${e.issues[0]?.path.join(".")} ${e.issues[0]?.message}` }, 400);
    console.error("chatfyre", e instanceof Error ? e.message : e);
    return json({ erro: "Falha inesperada ao falar com o Chatfyre." }, 500);
  }
});
