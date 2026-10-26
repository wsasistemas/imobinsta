# Diagnóstico Instagram @wsasistemas.ia — 25/10/2026

**Fonte:** MCP Chatfyre (`status_da_conta`, `listar_posts`, `listar_automacoes`), coleta em
`data/raw/2026-10-25/`. **Período pedido:** 27/07/2026 a 25/10/2026 (90 dias).

> **Diagnóstico parcial.** Todas as métricas de desempenho por post (views, alcance,
> curtidas, comentários, compartilhamentos, salvamentos) voltaram **indisponíveis**:
> `IG API 403: Application does not have permission for this action (code=10)`.
> Por isso não há taxa de engajamento, top 5 / bottom 5 nem comparação por desempenho.
> O que segue é só sobre **o que foi publicado**: quantidade, formato, tema e horário.

## 1. Resumo executivo

- 7 posts retornados no total (25/07 a 03/10/2026). 5 caem dentro dos 90 dias: **0,4 post por semana**.
- Último post foi em 03/10, **22 dias sem publicar**. Intervalos de até 20 dias entre posts.
- O perfil fala com 3 públicos diferentes: confeitarias (3 posts), gestores TOTVS RM/ERP (3) e imobiliárias (1).
- Só 1 Reel em 7 posts, e nenhuma automação de comentário→DM ativa no Chatfyre.
- Desempenho: **indisponível** (permissão de insights negada pela Meta ao app do Chatfyre).

## 2. Métricas gerais

| Métrica | Valor | Observação |
|---|---|---|
| Conta conectada | @wsasistemas.ia (WSA Informática \| Desenvolvimento Sistemas) | `status_da_conta` |
| Seguidores, seguindo, total de posts, bio | indisponível | Chatfyre não tem ferramenta para isso |
| Posts no período de 90 dias | 5 | 27/07 a 25/10 |
| Posts retornados no total | 7 | Pedidos 100. Se a conta tem só 7 posts, não dá para confirmar. |
| Frequência no período | 0,4 por semana (5 ÷ 12,9 semanas) | |
| Dias desde o último post | 22 | 03/10 → 25/10 |
| Engajamento mediano | indisponível | 403 code=10 |
| Crescimento de seguidores | indisponível | sem ferramenta |
| Automações ativas | 0 | `listar_automacoes` = [] |

## 3. Posts publicados

Sem métricas, a ordem abaixo é por data, não por desempenho.

| Data | Dia | Formato | Tema | Início da legenda |
|---|---|---|---|---|
| 03/10 11:58 | sáb | Reel | Confeitaria (ImobDocerias) | "Você coloca a mão na massa para criar bolos e doces artesanais…" |
| 27/09 17:25 | dom | Carrossel | Confeitaria (ImobDocerias) | "O unico sistema com todas as soluções para seu negocio…" |
| 07/09 22:51 | seg | Imagem | Confeitaria | "Você dedica paixão, tempo e os melhores ingredientes…" |
| 21/08 22:14 | sex | Imagem | ERP + IA | "Seu ERP já tem os dados. Agora ele pode trabalhar…" |
| 01/08 19:38 | sáb | Carrossel | TOTVS RM | "Será que o seu TOTVS RM realmente foi feito para ser lento?…" |
| 26/07 09:47 | dom | Imagem | Imobiliária (pós-venda) | "Seu relacionamento com o cliente não termina na assinatura…" |
| 25/07 13:09 | sáb | Imagem | TOTVS RM (enquete) | "Gestor, queremos ouvir você 👇 Qual é o maior desafio…" |

Os dois últimos ficam 1 e 2 dias fora da janela de 90 dias. Entram aqui porque a amostra é pequena.

## 4. Formatos, temas e horários (por volume, não por desempenho)

**Formato**

| Formato | Posts (7) | No período (5) |
|---|---|---|
| Imagem | 4 | 2 |
| Carrossel | 2 | 2 |
| Reel | 1 | 1 |

O perfil depende de imagem estática. Reel é o formato que o Instagram mais distribui para quem não segue, e aparece só uma vez.

**Tema**

| Tema | Posts | Produto |
|---|---|---|
| Confeitaria | 3 | ImobDocerias |
| TOTVS RM / ERP + IA | 3 | Serviços WSA |
| Imobiliária | 1 | ImobSystem |

O PRD trata o perfil como canal do ImobSystem, mas imobiliária é o tema **menos** publicado. Os 3 temas falam com públicos que não se sobrepõem, e cada seguidor vê só 1/3 do conteúdo como relevante.

**Dia e horário.** Sábado tem 3 posts, domingo 2, segunda e sexta 1 cada. Pela faixa de horário: manhã 2, tarde 2, noite 3. **Amostra insuficiente** para concluir qual dia ou horário rende mais: o PRD pede pelo menos 3 posts por grupo **com** métrica de desempenho, e nenhum grupo tem métrica.

**Chamadas para ação.** Só 1 legenda leva a um link (o carrossel de 27/09), e o link fica escrito na legenda, onde não é clicável. Só 1 post pede interação direta (a enquete de 25/07).

## 5. O que está funcionando e o que não está

- **Funcionando:** a conta está conectada e o token vale até 24/12/2026. Há conteúdo com dor clara do público ("TOTVS RM lento", "relacionamento pós-contrato").
- **Não está funcionando:**
  - a cadência é irregular (média de 0,4 post por semana, com buracos de 17 a 22 dias);
  - o posicionamento está dividido entre 3 públicos;
  - quase não há Reels;
  - não há CTA clicável;
  - o Chatfyre está contratado mas sem nenhuma automação.

## 6. Recomendações para as próximas 4 semanas

Estas recomendações se baseiam em volume e conteúdo, **não em desempenho**, que não está disponível.

1. **Cadência mínima de 2 posts por semana**, em dias fixos. Hoje é 0,4 por semana, com 22 dias parado.
2. **Escolher 1 público principal para este perfil.** Hoje são 3 temas para 7 posts. Se o perfil é do ImobSystem, imobiliária precisa passar de 1 em 7 para a maioria. Confeitaria e TOTVS podem ir para perfis ou destaques próprios.
3. **Um Reel por semana.** Hoje é 1 Reel em 7 posts.
4. **Uma automação de comentário→DM no Chatfyre.** Por exemplo: comente "SISTEMA" e receba o link do demo. Hoje são 0 automações, e o único link está numa legenda onde não é clicável.
5. **Liberar as métricas antes do próximo diagnóstico** (ver seção 7). Sem elas, não dá para cumprir o objetivo 2 do PRD (top 3 formatos e temas por desempenho).

## 7. Limitações

- **Métricas por post negadas** (403, code=10). O app do Chatfyre na Meta não tem a permissão de insights (`instagram_business_manage_insights`), ou ela não foi concedida quando o Instagram foi conectado.
- **Seguidores e insights da conta** não existem nas ferramentas do Chatfyre.
- **Não está claro se a conta tem só 7 posts:** foram pedidos 100 e vieram 7.
- **Amostra pequena:** 5 posts no período não sustentam comparação por grupo.

## 8. Conferência

Sem métricas, não há top 5 para conferir. Para validar a coleta, confira no app se estes 7 posts, com essas datas, são **todos** os posts do perfil desde 25/07/2026.
