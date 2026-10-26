# imobinsta — regras do projeto

## O que é
Projeto da WSA Sistemas de IA para conectar no Instagram @wsasistemas.ia através do
Chatfyre (servidor MCP em https://chatfyre.com/api/mcp) e analisar o desempenho da conta.
O escopo completo está em `docs/PRD.md`. Leia antes de qualquer tarefa.

## Fase atual
Fase 0 — conexão e análise via Claude Code (sem app web ainda).
Não crie frontend nem banco até a Fase 0 estar concluída e aprovada.

## Regras
- Fonte dos dados: SOMENTE as ferramentas do MCP `chatfyre`. Nunca invente número,
  métrica ou post. Se uma ferramenta não existir ou falhar, diga isso explicitamente.
- Somente leitura: não publique, não comente, não envie DM, não altere nada na conta.
  Se uma ferramenta do Chatfyre for de escrita, não a chame sem pedido explícito.
- Toda coleta é salva em `data/raw/AAAA-MM-DD/` (JSON bruto, fora do Git).
- Todo relatório vai para `reports/AAAA-MM-DD-<tema>.md`, em português.
- Ferramentas disponíveis do Chatfyre ficam documentadas em `docs/chatfyre-tools.md`.
- Segredos (chaves, tokens) só em `.env`, nunca em arquivo versionado.
- Ambiente: Windows + VS Code + PowerShell.
- Trabalhe em etapas curtas e termine cada etapa com checklist binário (feito / não feito).

## Stack prevista para a Fase 1 (não iniciar ainda)
React + TypeScript + Vite + Tailwind + shadcn/ui, Supabase próprio do produto,
chamadas ao Chatfyre só no backend (Edge Function), nunca no frontend.
