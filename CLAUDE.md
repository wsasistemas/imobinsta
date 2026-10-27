# imobinsta — regras do projeto

## O que é
Projeto da WSA Sistemas de IA para conectar no Instagram @wsasistemas.ia através do
Chatfyre (servidor MCP em https://chatfyre.com/api/mcp) e analisar o desempenho da conta.
O produto agora é o **Estúdio imobinsta** (mockup aprovado em 26/10/2026):
- Escopo em `docs/PRD-v2-estudio.md`. Leia antes de qualquer tarefa.
- Fases e checklists em `docs/PLANO-fases.md`.
- Mockup em `docs/mockups/estudio-imobinsta.html`.
- O `docs/PRD.md` (v0.1) registra só a Fase 0.

## Fase atual
Fases 0 a 6 no código e em produção (push de 27/10). Pendente do Wagner: migration 20261027050000
no SQL Editor e crédito no AI Studio (Gemini), que libera os testes reais da automação (Fase 5) e das
Recomendações IA (Fase 6). A próxima é a Fase 7 (IA paga), que só começa com o OK do Wagner.
Supabase: schema `imobinsta` no projeto compartilhado ikvj (`ikvjaowvpvxojvcfwnct`).
Nunca clicar em "Reset override" na Data API do painel.

## Regras
- Fonte dos dados: SOMENTE as ferramentas do MCP `chatfyre`. Nunca invente número,
  métrica ou post. Se uma ferramenta não existir ou falhar, diga isso explicitamente.
- Não publique posts, não comente e não envie DM manual. Não altere nada na conta.
- Exceção autorizada pelo Wagner em 25/10/2026: **automações de comentário→DM do Chatfyre**
  (`criar_automacao`, `atualizar_automacao`, `montar_fluxo`). Toda automação nasce
  **pausada** e o fluxo fica como **rascunho**. Ativar ou publicar só com OK explícito.
  Nunca automação de disparo em massa para quem não interagiu (proibido pela Meta).
- Toda coleta é salva em `data/raw/AAAA-MM-DD/` (JSON bruto, fora do Git).
- Todo relatório vai para `reports/AAAA-MM-DD-<tema>.md`, em português.
- Ferramentas disponíveis do Chatfyre ficam documentadas em `docs/chatfyre-tools.md`.
- Segredos (chaves, tokens) só em `.env`, nunca em arquivo versionado.
- Autenticação do Chatfyre: o `/mcp` não funciona (o servidor só aceita o redirect do
  claude.ai). O token vem de `.\scripts\chatfyre-token.ps1` e entra no MCP pelo header
  `Authorization: Bearer ${CHATFYRE_TOKEN}`. Se der 401, rode o script com `-Renovar`.
- Ambiente: Windows + VS Code + PowerShell.
- Trabalhe em etapas curtas e termine cada etapa com checklist binário (feito / não feito).

## Stack (Fase 1 em diante)
- Front: React + TypeScript + Vite + Tailwind + shadcn/ui, na Vercel.
- Banco: Supabase ikvj, schema `imobinsta`, RLS por `conta_id`, migrations aditivas.
- APIs externas (Instagram, Chatfyre, Gemini, OpenAI, HeyGen, fal.ai) **só em Edge Functions**,
  com chaves no Vault. Nunca no frontend.
- Imagens: templates HTML renderizados em PNG; a IA só preenche JSON.
- Proibido: DM automático para quem não interagiu, raspagem de perfis de terceiros.
