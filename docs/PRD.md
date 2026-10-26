# PRD — imobinsta

**Produto:** imobinsta (WSA Sistemas de IA)
**Conta analisada:** Instagram @wsasistemas.ia
**Integração:** Chatfyre via MCP (`https://chatfyre.com/api/mcp`)
**Dono:** Wagner Antunes
**Status:** Rascunho v0.1 — out/2026

---

## 1. Problema

O perfil @wsasistemas.ia é o principal canal de divulgação da WSA (ImobSystem e demais
produtos), mas hoje as decisões de conteúdo são tomadas sem uma visão consolidada de
desempenho: não se sabe com clareza quais formatos, temas e horários trazem alcance,
engajamento e seguidores. Os insights nativos do Instagram são fragmentados por post e
não respondem perguntas de negócio ("o que devo postar mais?"). Sem isso, o esforço de
conteúdo pode estar indo para o que menos converte.

## 2. Objetivos

1. **Diagnóstico em minutos:** gerar um relatório completo da conta (últimos 90 dias)
   com um único prompt, em menos de 10 minutos.
2. **Decisão de conteúdo baseada em dados:** identificar os 3 formatos e os 3 temas de
   melhor desempenho, com números que sustentem cada conclusão.
3. **Acompanhamento contínuo:** permitir comparar períodos (mês a mês) a partir de
   coletas salvas, sem depender de capturas de tela.
4. **Base para produto:** validar o fluxo Chatfyre → análise para, no futuro, oferecer
   a mesma análise a imobiliárias clientes do ImobSystem.

## 3. Fora do escopo (v1)

| Item | Motivo |
|---|---|
| Publicar posts, responder comentários ou enviar DMs | O projeto é de análise; escrita na conta traz risco sem ganho na v1 |
| Análise de concorrentes / perfis de terceiros | A Graph API só expõe insights da própria conta; scraping fere os termos da Meta |
| Multi-conta / SaaS para clientes | Só depois de validar o valor na conta própria (ver P2) |
| Anúncios pagos (Meta Ads) | Outra API e outro problema; pode virar módulo separado |
| Agendamento de posts | Já existem ferramentas maduras; não é o problema atual |

## 4. Histórias de usuário

**Wagner (dono da conta / gestor de marketing da WSA)**
- Quero pedir ao Claude "analise meu Instagram" e receber um diagnóstico em português,
  para decidir a pauta da semana sem abrir o app.
- Quero saber quais posts trouxeram mais alcance e seguidores, para repetir o que funciona.
- Quero comparar este mês com o anterior, para ver se a estratégia está melhorando.
- Quero que cada conclusão mostre o número que a sustenta, para confiar na análise.
- Quero ser avisado quando um dado não está disponível (permissão, limite da API), para
  não tomar decisão em cima de lacuna.

**Wagner (desenvolvedor)**
- Quero saber exatamente quais ferramentas o Chatfyre oferece, para planejar o app da Fase 1
  sem suposições.

## 5. Requisitos

### P0 — obrigatório (Fase 0)

**R1. Conexão MCP com o Chatfyre**
- [ ] Servidor `chatfyre` configurado em `.mcp.json` (Claude Code) e `.vscode/mcp.json`
- [ ] Autenticação concluída e conta @wsasistemas.ia identificada pelas ferramentas
- [ ] Se a conexão falhar, o erro é registrado com a causa provável (auth, rede, permissão)

**R2. Inventário das ferramentas**
- [ ] `docs/chatfyre-tools.md` lista cada ferramenta: nome, descrição, parâmetros,
      se é leitura ou escrita, e um exemplo de retorno real
- [ ] Indica quais métricas estão disponíveis e quais faltam em relação à seção 6

**R3. Coleta de dados (somente leitura)**
- [ ] Perfil: seguidores, seguindo, total de posts, bio
- [ ] Posts dos últimos 90 dias com tipo (imagem, carrossel, Reels), data/hora, legenda,
      curtidas, comentários e, quando houver, alcance, salvamentos, compartilhamentos e plays
- [ ] Insights da conta no período, quando disponíveis (alcance, visitas ao perfil,
      novos seguidores, cliques no link)
- [ ] JSON bruto salvo em `data/raw/AAAA-MM-DD/`
- [ ] Nenhuma ferramenta de escrita é chamada

**R4. Relatório de diagnóstico**
- [ ] Gerado em `reports/AAAA-MM-DD-diagnostico.md`
- [ ] Contém: resumo executivo (5 linhas), métricas gerais, top 5 e bottom 5 posts,
      desempenho por formato, por tema, por dia da semana e faixa de horário,
      e 5 recomendações acionáveis
- [ ] Toda afirmação numérica vem dos dados coletados; métrica ausente aparece como
      "indisponível" com o motivo

### P1 — desejável (Fase 1)

**R5. Comparação de períodos** — relatório lê duas coletas e mostra variação percentual.
**R6. Dashboard web** — React/Vite/Tailwind/shadcn com Supabase próprio; Chatfyre chamado
só no backend (Edge Function); cartões de KPI, gráfico de evolução e ranking de posts.
**R7. Sugestão de pauta** — 10 ideias de post baseadas nos temas de melhor desempenho,
alinhadas aos produtos WSA.
**R8. Coleta agendada** — snapshot semanal automático.

### P2 — futuro (projetar sem construir)

- **Multi-conta para imobiliárias clientes do ImobSystem:** o modelo de dados deve ter
  `account_id` desde a Fase 1, mesmo com uma conta só.
- **Análise de comentários e leads:** classificar comentários (dúvida, interesse, elogio)
  e destacar potenciais clientes.
- **Integração com o CRM/ImobSystem:** levar leads do Instagram para o funil.

## 6. Métricas de análise (o que o relatório calcula)

| Métrica | Fórmula |
|---|---|
| Taxa de engajamento por post | (curtidas + comentários + salvamentos + compartilhamentos) ÷ alcance |
| Taxa de engajamento (sem alcance) | (curtidas + comentários) ÷ seguidores — usar só se alcance indisponível, e sinalizar |
| Taxa de salvamento | salvamentos ÷ alcance |
| Crescimento de seguidores | seguidores fim − seguidores início do período |
| Frequência de postagem | posts por semana |
| Desempenho por formato | mediana de engajamento por tipo de post |

Usar **mediana** nas comparações por grupo, para que um post viral não distorça o resultado.

## 7. Métricas de sucesso do projeto

**Curto prazo (até 2 semanas)**
- Conexão funcionando e inventário de ferramentas documentado
- Primeiro diagnóstico gerado sem números inventados (conferência manual de 5 posts
  contra o app do Instagram: 100% batendo)

**Médio prazo (60–90 dias)**
- Pauta da WSA definida a partir dos relatórios mensais
- Taxa de engajamento mediana da conta subindo em relação ao primeiro diagnóstico
  (meta: +20%; meta ousada: +40%)

## 8. Perguntas em aberto

| # | Pergunta | Quem responde | Bloqueia? |
|---|---|---|---|
| 1 | O Chatfyre usa OAuth ou chave de API? | Chatfyre / teste | Sim |
| 2 | Quais ferramentas e métricas o Chatfyre expõe (insights de alcance, Reels, stories)? | Prompt 01 | Sim |
| 3 | @wsasistemas.ia já é conta Business ou Creator ligada a uma página do Facebook? | Wagner | Sim |
| 4 | Há limite de chamadas ou custo por uso no Chatfyre? | Chatfyre | Não |
| 5 | O Chatfyre oferece API REST para o app da Fase 1, ou só MCP? | Chatfyre | Não (bloqueia Fase 1) |
| 6 | Por quanto tempo guardar os JSON brutos (LGPD, dados de comentários de terceiros)? | Wagner | Não |

## 9. Fases

| Fase | Entrega | Critério de saída |
|---|---|---|
| 0 | Conexão + inventário + primeiro diagnóstico via Claude Code | R1–R4 com checklist completo |
| 1 | Dashboard web + comparação de períodos + pauta | R5–R8 |
| 2 | Multi-conta / oferta para clientes | Decisão após 90 dias da Fase 1 |
