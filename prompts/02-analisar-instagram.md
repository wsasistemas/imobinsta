# Prompt 02 — Coletar e analisar o Instagram @wsasistemas.ia

Rode só depois do Prompt 01 concluído. Cole no Claude Code:

---

Leia `CLAUDE.md`, `docs/PRD.md` e `docs/chatfyre-tools.md`. Estamos na Fase 0,
requisitos R3 e R4. Use somente ferramentas de LEITURA do MCP `chatfyre`.

## Etapa 1 — Coleta
Usando as ferramentas documentadas em `docs/chatfyre-tools.md`, colete da conta
@wsasistemas.ia:
- perfil: seguidores, seguindo, total de posts, bio
- todos os posts dos últimos 90 dias, com tipo, data/hora, legenda, curtidas, comentários
  e, se houver, alcance, salvamentos, compartilhamentos e plays (Reels)
- insights da conta no período, se disponíveis

Faça a paginação até cobrir os 90 dias. Salve o JSON bruto em
`data/raw/<data de hoje>/` (um arquivo por tipo: perfil.json, posts.json, insights.json).
Informe quantos posts foram coletados e o intervalo de datas real.

## Etapa 2 — Análise
Calcule, com as fórmulas da seção 6 do PRD:
1. Visão geral: seguidores, posts no período, frequência semanal, engajamento mediano
2. Top 5 e bottom 5 posts por taxa de engajamento (data, formato, início da legenda, números)
3. Desempenho por formato (imagem, carrossel, Reels): quantidade e mediana de engajamento,
   alcance e salvamentos
4. Desempenho por tema: agrupe as legendas em 4 a 6 temas (ex.: ImobSystem, IA aplicada,
   bastidores, dicas para imobiliárias, institucional) e compare as medianas
5. Melhor dia da semana e faixa de horário (manhã, tarde, noite), só se houver pelo menos
   3 posts por grupo; caso contrário, diga que a amostra é insuficiente
6. Hashtags e chamadas para ação mais presentes nos top posts versus nos bottom posts

Use mediana nas comparações por grupo. Se uma métrica não vier do Chatfyre, escreva
"indisponível" e o motivo. Não estime, não arredonde para cima, não invente.

## Etapa 3 — Relatório
Crie `reports/<data de hoje>-diagnostico.md` em português com:
1. Resumo executivo (no máximo 5 linhas, com os números principais)
2. Métricas gerais
3. Top 5 / bottom 5 (tabela)
4. Formatos, temas e horários (tabelas + 1 parágrafo de leitura cada)
5. O que está funcionando e o que não está
6. 5 recomendações acionáveis para as próximas 4 semanas, cada uma ligada a um dado
   do relatório (ex.: "Postar mais carrosséis de dicas: mediana de salvamentos 3x maior
   que imagem única")
7. Limitações da análise (métricas ausentes, amostra pequena, período)

## Etapa 4 — Conferência
Liste 5 posts do top 5 com data e números para eu conferir no app do Instagram.

Termine com checklist:
- [ ] Coleta concluída e salva em data/raw/
- [ ] Nenhuma ferramenta de escrita chamada
- [ ] Relatório gerado em reports/
- [ ] Todas as afirmações numéricas vêm dos dados coletados
- [ ] Lista de conferência entregue
