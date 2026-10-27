# Ferramentas do Chatfyre (MCP)

**Levantamento:** 25/10/2026, a partir dos schemas que o servidor `chatfyre` expõe no Claude Code.
**Situação (25/10/2026, 23:30):** conectado (token via `scripts/chatfyre-token.ps1`),
assinatura ativa, conta confirmada **@wsasistemas.ia**. Posts vêm, **métricas por post não**
(IG API 403 code=10). Sem assinatura, toda chamada é recusada com
"Esta conta não tem assinatura ativa".

## Ferramentas

Todas as 7 ferramentas expostas são de **LEITURA**. As de escrita citadas nas instruções
do servidor (`montar_fluxo`, criação de automações) não aparecem para o escopo
`automacoes:ler` usado no token.

| Ferramenta | Tipo | Para que serve | Parâmetros |
|---|---|---|---|
| `status_da_conta` | Leitura | Qual @ do Instagram está conectado, validade do token, resumo da fila de envio | — |
| `listar_posts` | Leitura | Posts e Reels recentes com id, legenda, link e desempenho (views, alcance, curtidas, comentários, compartilhamentos, salvamentos) | `limite` (number, opc., padrão 12); `ordenar_por` (`views` \| `reach` \| `total_interactions` \| `data`, opc., padrão `views`); `apenas_reels` (bool, opc.); `metricas` (bool, opc., padrão true) |
| `listar_automacoes` | Leitura | Automações com gatilhos, palavras-chave, link e follow-ups | — |
| `metricas` | Leitura | Desempenho por automação: respostas públicas, DMs, opt-ins, follow-ups, falhas, taxa de opt-in | `automacao_id` (string, opc.); `dias` (number, opc., padrão 30) |
| `metricas_do_fluxo` | Leitura | Funil de uma automação (comentou → DM → botão → link → clique → venda) e números por bloco; aponta o gargalo | `automacao_id` (string, **obrig.**); `dias` (7, 14, 30 ou 0 = sempre; padrão 7) |
| `ver_fila` | Leitura | Itens recentes da fila de envio com status e erro | `limite` (number, opc., padrão 20); `status` (`pending` \| `sending` \| `sent` \| `unconfirmed` \| `failed` \| `skipped`, opc.) |
| `ver_fluxo` | Leitura | Fluxo em blocos de uma automação e histórico de versões | `automacao_id` (string, **obrig.**) |

## Exemplos de retorno real

`status_da_conta`:
```json
{ "conectado": true, "usuario": "@wsasistemas.ia", "nome": "WSA Informática | Desenvolvimento Sistemas",
  "ig_user_id": "17841419660248771", "token_valido_ate": "24/12/2026, 23:29",
  "fila": { "pending": 0, "sending": 0, "sent": 0, "unconfirmed": 0, "failed": 0, "skipped": 0 } }
```

`listar_posts` (`limite: 100`, `ordenar_por: data`): 7 itens. Exemplo de 1 item:
```json
{ "media_id": "18119239366945501", "tipo": "VIDEO", "reel": true,
  "legenda": "Você coloca a mão na massa… (cortada em ~120 caracteres)",
  "link": "https://www.instagram.com/reel/DeCU9hjk6ZQ/", "publicado_em": "03/10/2026, 11:58",
  "desempenho": { "views": null, "reach": null, "likes": null, "comments": null, "shares": null,
    "saved": null, "total_interactions": null,
    "erro": "IG API 403: Application does not have permission for this action [type=IGApiException code=10]" } }
```

`listar_automacoes`: `[]`. `metricas`, `metricas_do_fluxo`, `ver_fluxo`: não testadas (dependem de automação).
`ver_fila`: não testada (fila zerada no `status_da_conta`).

## Cobertura das métricas da seção 6 do PRD

Confirmado com retorno real em 25/10/2026:

| Necessidade do PRD | Situação | Fonte |
|---|---|---|
| Curtidas, comentários, compartilhamentos, salvamentos por post | **Bloqueado** (403 code=10) | `listar_posts` |
| Alcance por post | **Bloqueado** (403 code=10) | `listar_posts` (`reach`) |
| Plays/views de Reels | **Bloqueado** (403 code=10) | `listar_posts` (`views`) |
| Data/hora do post | **Disponível** (`publicado_em`) | `listar_posts` |
| Tipo do post (imagem, carrossel, Reels) | **Disponível** (`tipo` + `reel`) | `listar_posts` |
| Taxa de engajamento e de salvamento | Calculável, se os campos acima vierem | — |
| Seguidores (total) | **Não previsto** | nenhuma ferramenta declara |
| Crescimento de seguidores no período | **Não previsto** | nenhuma ferramenta declara |
| Insights da conta (alcance, visitas ao perfil, cliques no link) | **Não previsto** | nenhuma ferramenta declara |
| Stories | **Não previsto** | nenhuma ferramenta declara |

## Limites conhecidos

- **Métricas por post: 403 code=10** em todos os posts. O app do Chatfyre na Meta não tem
  (ou não recebeu) a permissão de insights. Correção depende de reconectar o Instagram no
  Chatfyre aceitando todas as permissões, ou do suporte do Chatfyre.
- **Legenda truncada** em ~120 caracteres no retorno.
- `limite: 100` devolveu só 7 posts (não confirmado se é o total da conta).
- **Sem paginação nem filtro de período** em `listar_posts`: só `limite`.
- Acesso via MCP exige **plano pago** (Solo, Pro ou Enterprise).
- O OAuth só aceita o redirect do claude.ai; o token local vem do script e precisa ser
  renovado com `-Renovar` quando expirar.
- O foco do produto é automação de DM; as métricas de conta do PRD (seguidores, visitas,
  cliques) provavelmente terão de vir de outra fonte (Graph API direta ou export do app).

## Acesso pelo backend (Fase 5, 27/10/2026)

- A Edge Function `chatfyre` fala com `https://chatfyre.com/api/mcp` por JSON-RPC (initialize →
  notifications/initialized → tools/call), aceitando resposta JSON ou SSE e o cabeçalho `Mcp-Session-Id`.
- Credenciais: um login **separado** do Claude Code, feito com `scripts/chatfyre-token.ps1 -Exportar`
  (escopo `automacoes:ler automacoes:escrever`). O pacote vai para o Vault pela tela Conexões; a função
  renova o access token com o refresh token e grava o novo no Vault.
- Na rede do escritório o firewall Fortinet intercepta o TLS do chatfyre.com (certificado emitido pela
  CA do FortiGate), então nada local consegue falar com o Chatfyre por lá: nem o MCP do Claude Code
  nem o script. Rodar o script em outra rede. As Edge Functions não passam por esse firewall.
- Pergunta 7 do PRD (backend aceita o token?): **a confirmar** quando o pacote for colado.
