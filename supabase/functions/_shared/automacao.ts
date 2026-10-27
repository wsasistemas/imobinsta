// Automação comentário → DM do Chatfyre ligada a um post publicado (Etapa 5.3).
//
// Regras do projeto: nunca sem media_id; sempre nasce pausada (active: false); o fluxo de blocos
// (só para quem segue) fica como rascunho e só é publicado quando o dono ativa na tela Automações.
import { z } from "npm:zod@3.25.76";
import type { Db } from "./comum.ts";
import { comChatfyre, ErroChatfyre, type Sessao } from "./chatfyre.ts";

/** Formato de posts.automacao_json (tela Publicar). Os textos novos têm padrão para rascunhos antigos. */
export const ConfigAutomacao = z.object({
  palavra: z.string().trim().min(1).max(30),
  resposta_publica: z.string().trim().max(200).default(""),
  dm: z.string().trim().min(1).max(1000),
  botao: z.string().trim().min(1).max(20),
  so_seguidores: z.boolean().default(false),
  link: z.string().trim().max(500).default(""),
  texto_link: z.string().trim().max(1000).default("Aqui está o link que te prometi 👇"),
  botao_link: z.string().trim().max(20).default("Abrir"),
  lembrete_min: z.number().int().min(0).max(1440).default(0),
  texto_lembrete: z.string().trim().max(1000).default("Passando para lembrar: o link continua aqui em cima 😉"),
});
export type ConfigAutomacao = z.infer<typeof ConfigAutomacao>;

const NAO_SEGUE = "Parece que você ainda não segue a gente 👀 Segue o perfil e toca no botão que eu te mando na hora.";
const JA_SEGUI = "Já segui, manda";

type PostAutomacao = {
  id: string; conta_id: string; produto: string | null; ig_media_id: string | null;
  criar_automacao: boolean; automacao_json: unknown;
};

export type Resultado = { automacao_id: string; status: "pausada" | "ativa" | "erro"; fluxo?: string; erro?: string | null };

function nomeDa(post: PostAutomacao, c: ConfigAutomacao) {
  return `Estúdio · ${(post.produto ?? "Post").slice(0, 40)} · ${c.palavra} · ${post.id.slice(0, 8)}`;
}

/** Argumentos do criar_automacao (motor linear). active é sempre false. */
function argumentosCriar(nome: string, mediaId: string, c: ConfigAutomacao) {
  const args: Record<string, unknown> = {
    name: nome,
    active: false,
    trigger_comment: true,
    trigger_story: false,
    trigger_dm: false,
    trigger_follow: false,
    trigger_live: false,
    keywords: [c.palavra],
    match_type: "contains",
    media_id: mediaId,
    welcome_dm: c.dm,
    quick_reply_label: c.botao,
  };
  if (c.resposta_publica) args.public_replies = [c.resposta_publica];
  if (c.link) {
    args.link_url = c.link;
    args.link_text = c.texto_link;
    args.link_button_label = c.botao_link;
    if (c.lembrete_min > 0) {
      args.reminder_text = c.texto_lembrete;
      args.reminder_delay_minutes = c.lembrete_min;
    }
  }
  return args;
}

/** Fluxo "só para quem segue": boas-vindas → segue? → sim: link (→ lembrete) · não: convite que volta para a condição. */
export function fluxoSeguidor(c: ConfigAutomacao) {
  const entrega = c.link
    ? { id: "link", tipo: "mensagem", rotulo: "Link", texto: c.texto_link, botao: { rotulo: c.botao_link, url: c.link } }
    : { id: "link", tipo: "mensagem", rotulo: "Entrega", texto: c.texto_link };
  const nos: Record<string, unknown>[] = [
    { id: "inicio", tipo: "gatilho" },
    { id: "boas", tipo: "mensagem", rotulo: "Boas-vindas", texto: c.dm, respostaRapida: { rotulo: c.botao } },
    { id: "segue", tipo: "condicao", teste: "segue_a_conta" },
    entrega,
    { id: "convite", tipo: "mensagem", rotulo: "Convite para seguir", texto: NAO_SEGUE, respostaRapida: { rotulo: JA_SEGUI } },
  ];
  const arestas: Record<string, unknown>[] = [
    { de: "inicio", para: "boas" },
    { de: "boas", para: "segue" },
    { de: "segue", para: "link", saida: "sim" },
    { de: "segue", para: "convite", saida: "nao" },
    { de: "convite", para: "segue" },
  ];
  if (c.link && c.lembrete_min > 0) {
    nos.push({ id: "espera", tipo: "espera", minutos: c.lembrete_min });
    nos.push({ id: "lembrete", tipo: "mensagem", rotulo: "Lembrete", texto: c.texto_lembrete });
    arestas.push({ de: "link", para: "espera" }, { de: "espera", para: "lembrete" });
  }
  return { nos, arestas };
}

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

/** O formato da resposta do criar_automacao não é documentado: procura o id nos lugares prováveis. */
function acharId(r: unknown, fundo = 0): string | null {
  if (typeof r === "string") return r.match(UUID)?.[0] ?? null;
  if (!r || typeof r !== "object" || fundo > 2) return null;
  const o = r as Record<string, unknown>;
  for (const k of ["id", "automacao_id", "automation_id"]) {
    if (typeof o[k] === "string" || typeof o[k] === "number") return String(o[k]);
  }
  for (const k of ["automacao", "automation", "data", "resultado"]) {
    const v = acharId(o[k], fundo + 1);
    if (v) return v;
  }
  return null;
}

/** Lista de automações em qualquer embrulho ({automacoes: [...]}, {items: [...]} ou o array direto). */
export function listaDe(r: unknown): Record<string, unknown>[] {
  if (Array.isArray(r)) return r as Record<string, unknown>[];
  if (r && typeof r === "object") {
    const arr = Object.values(r as Record<string, unknown>).find(Array.isArray);
    if (arr) return arr as Record<string, unknown>[];
  }
  return [];
}

async function criarNoChatfyre(s: Sessao, nome: string, mediaId: string, c: ConfigAutomacao) {
  const r = await s.chamar("criar_automacao", argumentosCriar(nome, mediaId, c));
  let id = acharId(r);
  if (!id) {
    const achada = listaDe(await s.chamar("listar_automacoes")).find((a) => a.name === nome || a.nome === nome);
    id = achada ? acharId(achada) : null;
  }
  if (!id) throw new ErroChatfyre("O Chatfyre criou a automação mas não devolveu o id. Confira no painel do Chatfyre antes de tentar de novo.", 502);
  return id;
}

/**
 * Cria no Chatfyre a automação do post (pausada) e espelha em imobinsta.automacoes.
 * Idempotente: se o post já tem automação com id do Chatfyre, devolve a existente.
 * Devolve null quando o post não pediu automação.
 */
export async function criarAutomacaoDoPost(db: Db, postId: string): Promise<Resultado | null> {
  const { data: post, error } = await db
    .from("posts")
    .select("id, conta_id, produto, ig_media_id, criar_automacao, automacao_json")
    .eq("id", postId)
    .single();
  if (error) throw error;
  const p = post as PostAutomacao;
  if (!p.criar_automacao || !p.automacao_json) return null;
  if (!p.ig_media_id) throw new ErroChatfyre("O post ainda não tem media_id do Instagram. A automação só é criada depois de publicar.", 409);

  const { data: existente } = await db.from("automacoes").select("id, chatfyre_id, status").eq("post_id", postId).maybeSingle();
  if (existente?.chatfyre_id) return { automacao_id: existente.id, status: existente.status };

  const v = ConfigAutomacao.safeParse(p.automacao_json);
  const base = { conta_id: p.conta_id, post_id: postId, atualizado_em: new Date().toISOString() };
  const gravar = async (linha: Record<string, unknown>) => {
    const q = existente
      ? db.from("automacoes").update({ ...base, ...linha }).eq("id", existente.id)
      : db.from("automacoes").insert({ ...base, ...linha });
    const { data, error: e } = await q.select("id").single();
    if (e) throw e;
    return data.id as string;
  };

  if (!v.success) {
    const erro = "Configuração da automação incompleta: palavra-chave, DM e botão são obrigatórios.";
    return { automacao_id: await gravar({ status: "erro", erro }), status: "erro", erro };
  }
  const c = v.data;
  const nome = nomeDa(p, c);
  try {
    const { chatfyreId, fluxo, aviso } = await comChatfyre(db, p.conta_id, async (s) => {
      const chatfyreId = await criarNoChatfyre(s, nome, p.ig_media_id!, c);
      if (!c.so_seguidores) return { chatfyreId, fluxo: "linear", aviso: null };
      try {
        await s.chamar("montar_fluxo", { automacao_id: chatfyreId, publicar: false, fluxo: fluxoSeguidor(c) });
        return { chatfyreId, fluxo: "rascunho", aviso: null };
      } catch (e) {
        // A automação existe e está pausada; o fluxo é montado de novo na hora de ativar.
        return { chatfyreId, fluxo: "pendente", aviso: `Fluxo "só para quem segue" não foi salvo: ${(e as Error).message}`.slice(0, 500) };
      }
    });
    const id = await gravar({
      chatfyre_id: chatfyreId, nome, palavra: c.palavra, status: "pausada", erro: aviso,
      config_json: { ...c, media_id: p.ig_media_id, fluxo },
    });
    return { automacao_id: id, status: "pausada", fluxo, erro: aviso };
  } catch (e) {
    const erro = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    console.error("automacao", postId, erro);
    return { automacao_id: await gravar({ nome, palavra: c.palavra, status: "erro", erro, config_json: { ...c, media_id: p.ig_media_id } }), status: "erro", erro };
  }
}

/** Ativa (publicando o fluxo, se for "só para quem segue") ou pausa. Só a tela Automações chama, com confirmação. */
export async function definirStatus(db: Db, contaId: string, automacaoId: string, ativa: boolean) {
  const { data: a, error } = await db
    .from("automacoes")
    .select("id, chatfyre_id, config_json, versao_fluxo")
    .eq("id", automacaoId)
    .eq("conta_id", contaId)
    .maybeSingle();
  if (error) throw error;
  if (!a) throw new ErroChatfyre("Automação não encontrada nesta conta.", 404);
  if (!a.chatfyre_id) throw new ErroChatfyre("Esta automação não chegou ao Chatfyre. Use \"Criar de novo\".", 409);

  const cfg = ConfigAutomacao.safeParse(a.config_json);
  const comFluxo = ativa && cfg.success && cfg.data.so_seguidores;
  const versao = await comChatfyre(db, contaId, async (s) => {
    let versao: number | null = a.versao_fluxo;
    if (comFluxo) {
      const r = await s.chamar("montar_fluxo", { automacao_id: a.chatfyre_id, publicar: true, fluxo: fluxoSeguidor(cfg.data) });
      const n = (r as { versao?: unknown; version?: unknown } | null);
      versao = Number(n?.versao ?? n?.version) || (versao ?? 0) + 1;
    }
    await s.chamar("definir_status_automacao", { id: a.chatfyre_id, ativa });
    return versao;
  });
  const config = { ...(a.config_json as Record<string, unknown>), ...(comFluxo ? { fluxo: "publicado" } : {}) };
  const { error: e } = await db.from("automacoes").update({
    status: ativa ? "ativa" : "pausada", erro: null, versao_fluxo: versao, config_json: config, atualizado_em: new Date().toISOString(),
  }).eq("id", automacaoId);
  if (e) throw e;
  return { status: ativa ? "ativa" : "pausada", versao_fluxo: versao };
}
