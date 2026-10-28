# PRD v2 — Estúdio imobinsta

**Produto:** Estúdio imobinsta (WSA Sistemas de IA)
**Conta:** Instagram @wsasistemas.ia
**Dono:** Wagner Antunes
**Status:** v2.0, 26/10/2026. Mockup aprovado: `docs/mockups/estudio-imobinsta.html`
**Substitui:** a parte de produto do `docs/PRD.md` (v0.1). As decisões da Fase 0 (Chatfyre, OAuth, diagnóstico) continuam valendo.

---

## 1. Problema

A WSA paga uma ferramenta de conteúdo (bestcontent) para criar posts, e mesmo assim:

- os recursos de vídeo ficam bloqueados no plano MAX;
- as automações de venda estão em outra ferramenta (Chatfyre);
- as métricas estão em outra (Instagram).

O perfil @wsasistemas.ia ficou **22 dias sem publicar** e fez **0,4 post por semana** nos últimos 90 dias (`reports/2026-10-25-diagnostico.md`). Falta um lugar só onde criar, publicar e vender seja rápido e barato.

## 2. Objetivos

1. **Um lugar só:** criar, publicar, automatizar a venda e medir, sem trocar de ferramenta.
2. **Custo fixo zero de ferramenta de conteúdo:** templates, render e publicação gratuitos. IA paga só por uso, com teto mensal.
3. **Cadência:** chegar a 2 posts por semana, sendo pelo menos 1 Reels, em até 30 dias depois da Fase 5.
4. **Seguidores e vendas:** todo post de venda sai com automação "comente QUERO" ligada ao próprio post.
5. **Base para SaaS:** `conta_id` em todas as tabelas, para oferecer o estúdio a clientes ImobSystem no futuro.

## 3. Fora do escopo (v2)

| Item | Motivo |
|---|---|
| DM automático para quem não interagiu | Proibido pela Meta, derruba a conta (aviso do próprio Chatfyre). O radar só sugere comentários, que o Wagner publica. |
| Raspar perfis ou posts de terceiros | Viola os termos da Meta. Só a busca oficial por hashtag é usada. |
| TikTok e YouTube | Ficam para depois do Instagram estável |
| Anúncios pagos (Meta Ads) | Outra API e outro problema |
| Multi-conta / SaaS para clientes | Só desenhado (`conta_id`), não construído |
| Geração de música por IA | Trilhas livres de direitos no banco de mídias resolvem |

## 4. Telas (iguais ao mockup aprovado)

| Tela | Resumo |
|---|---|
| Explorar | Destaque e atalhos |
| Criar | Imagem/carrossel, Reels, imagem por IA, vídeo com avatar |
| Wizard de imagem | Formato → Conteúdo (objetivo, produto, abordagem, origem) → Prompt adaptado → Editor (slides, canvas, chat IA) → Publicar |
| Vídeo com avatar | Roteiro em blocos → avatar e voz → cenas → gerar → publicar |
| Publicar | Preview do Instagram, legenda, painel da automação Chatfyre, agora ou agendado |
| Biblioteca | Pastas, filtros (rascunho, agendado, publicado), busca |
| Banco de mídias | Upload de imagem, vídeo, logo, trilha e prints dos sistemas |
| Meus avatares | Avatares treinados no provedor, com consentimento |
| Calendário | Mês, pautas, sugestões IA |
| Automações | Funil Chatfyre e lista de automações |
| Radar de prospecção | Hashtags monitoradas, oportunidades classificadas por IA, comentário sugerido |
| Analytics | Seguidores, alcance, ranking de posts |
| Conexões e custos | Instagram, Chatfyre, Gemini, provedores pagos e teto de gasto |

## 5. Requisitos

### P0: sem isso não há produto (Fases 1 a 5)

- **R1. Login e conta:**
  - login pelo Supabase Auth do projeto;
  - tabela de membros por `conta_id`;
  - RLS em todas as tabelas.
- **R2. Conexão oficial com o Instagram:**
  - OAuth da Meta;
  - token guardado no Vault;
  - renovação automática do token antes de vencer.
- **R3. Sincronizar posts e métricas:**
  - posts com alcance, curtidas, comentários, salvamentos, compartilhamentos e views;
  - seguidores por dia;
  - snapshot diário, guardado no banco.
- **R4. Banco de mídias:**
  - upload para o Supabase Storage;
  - pastas e tipos de arquivo;
  - limite de 100 MB por arquivo.
- **R5. Criar imagem e carrossel:**
  - templates HTML da WSA;
  - a IA (Gemini) só preenche textos, cores e posições, em JSON;
  - o PNG é renderizado no navegador. **Nenhum custo por imagem.**
- **R6. Legenda:**
  - gerada pela IA a partir do conteúdo;
  - limite de 2.200 caracteres e até 5 hashtags.
- **R7. Publicar e agendar no Instagram:**
  - post único e carrossel pela API oficial;
  - agendamento por fila no banco e rotina a cada 5 minutos.
- **R8. Automação Chatfyre junto com o post:**
  - depois de publicar, o backend cria a automação com o `media_id` do post;
  - ela nasce **pausada** e é ativada só com OK explícito na tela;
  - fluxo padrão: boas-vindas com botão → verifica se segue → link → lembrete.

### P1: completa o estúdio (Fases 6 a 8)

- **R9. Calendário e pautas:** pautas no calendário e sugestão de 2 posts por semana pela IA.
- **R10. Imagem por IA:** OpenAI GPT Image (ou fal.ai), com custo registrado por geração.
- **R11. Vídeo com avatar:**
  - roteiro pela IA;
  - avatar e voz no HeyGen (ou fal.ai);
  - vídeo salvo no banco de mídias e publicado como Reels.
- **R12. Teto de gasto:**
  - limite mensal em US$;
  - confirmação acima de um valor por geração;
  - bloqueio ao atingir o teto.
- **R13. Reels de fotos:** montagem por template (Remotion) com fotos, textos, legenda e trilha. O render roda localmente.

### P2: crescimento (Fase 9 em diante)

- **R14. Radar de prospecção:**
  - busca oficial por hashtag;
  - a IA classifica a dor pela legenda e sugere um comentário;
  - limite de 20 comentários por dia, com publicação **manual**.
- **R15. Multi-conta:** clientes ImobSystem, cada um com a sua `conta_id`.

## 6. Arquitetura

```
Navegador (React + Vite + Tailwind + shadcn)
  │  login Supabase · lê/grava schema imobinsta (RLS)
  │  renderiza template → PNG (html-to-image) → Storage
  ▼
Supabase ikvj · schema imobinsta
  ├─ Tabelas + RLS por conta_id
  ├─ Storage: bucket imobinsta-midias (público só p/ arquivos publicados)
  ├─ Vault: tokens Instagram, Chatfyre, Gemini, OpenAI, HeyGen
  ├─ pg_cron: publicar agendados (5 min) · sync métricas (diário) · renovar tokens
  └─ Edge Functions (Deno) — ÚNICO lugar que fala com APIs externas
       ├─ ig-oauth, ig-sync, ig-publicar, ig-hashtag
       ├─ chatfyre (JSON-RPC MCP via HTTP + Bearer; renova token)
       ├─ ia-texto (Gemini), ia-imagem (OpenAI/fal), ia-avatar (HeyGen/fal)
       └─ uso-ia (registra custo, aplica teto)
Render local (PC do Wagner): Remotion CLI para Reels de fotos → upload no Storage
```

**Regras fixas:**
- Nenhuma chave no frontend. Toda chamada externa passa por Edge Function.
- Migrations sempre **aditivas** em `supabase/migrations/`.
- O schema `imobinsta` é exposto na API acrescentando à lista existente (`20261026010000_criar_schema_imobinsta.sql`). **Nunca** clicar em Reset override no painel.

## 7. Modelo de dados (schema `imobinsta`)

| Tabela | Principais colunas |
|---|---|
| `contas` | id, nome, ig_user_id, ig_username |
| `membros` | conta_id, user_id, papel (dono/editor) |
| `conexoes` | conta_id, provedor (instagram/chatfyre/gemini/openai/heygen/fal), status, vault_secret_id, expira_em |
| `midias` | conta_id, pasta, tipo (imagem/video/logo/trilha/print), storage_path, largura, altura, duracao_s, origem (upload/ia/render) |
| `templates` | id, nome, formato, html, campos_json |
| `posts` | conta_id, formato (post/carrossel/reels/stories), objetivo, produto, legenda, status (rascunho/agendado/publicando/publicado/erro), agendado_para, ig_media_id, permalink, publicado_em, erro |
| `post_slides` | post_id, ordem, template_id, dados_json, midia_id (PNG final) |
| `pautas` | conta_id, data, titulo, produto, formato, origem (manual/ia), post_id |
| `automacoes` | conta_id, post_id, chatfyre_id, palavra, status (pausada/ativa), versao_fluxo |
| `avatares` | conta_id, nome, provedor, provedor_avatar_id, voz_id, consentimento_em |
| `roteiros` | post_id, blocos_json (tempo, fala, cena) |
| `geracoes_ia` | conta_id, provedor, tipo (texto/imagem/video/avatar), custo_usd, status, post_id |
| `metricas_post` | post_id, data, alcance, views, curtidas, comentarios, salvamentos, compartilhamentos |
| `metricas_conta` | conta_id, data, seguidores, alcance |
| `radar_hashtags` | conta_id, hashtag, ig_hashtag_id, ativa |
| `radar_oportunidades` | conta_id, hashtag_id, permalink, legenda, dor, produto_sugerido, comentario_sugerido, status |

## 8. Custos

| Parte | Custo |
|---|---|
| Vercel Hobby, Supabase Free (ikvj, compartilhado), templates, html-to-image, Remotion local, Instagram API, Gemini (cota gratuita) | **R$ 0** |
| Chatfyre (plano com acesso por API) | plano mensal do Chatfyre |
| OpenAI / HeyGen / fal.ai | por uso, com teto definido pelo Wagner |

## 9. Métricas de sucesso

- **Fase 5 no ar:** 1 post criado no estúdio e publicado no Instagram com automação "QUERO" ligada ao post, sem abrir o bestcontent.
- **30 dias depois:** pelo menos 8 posts publicados (2 por semana), sendo pelo menos 4 Reels.
- **60 a 90 dias:**
  - seguidores e alcance crescendo, medidos em `metricas_conta`;
  - leads com origem `utm_campaign` das automações.
- **Custo:** zero de ferramenta de conteúdo. O gasto com IA fica dentro do teto.

## 10. Perguntas em aberto

| # | Pergunta | Quem responde | Bloqueia |
|---|---|---|---|
| 1 | O projeto Supabase é mesmo o **ikvj**? | Wagner | Fase 1 |
| 2 | App da Meta: **Instagram Login** (mais simples) ou **Facebook Login** (exige página do Facebook)? A busca por hashtag (radar) só existe no caminho com Facebook Login, o que ainda precisa ser confirmado na documentação da Meta. | Teste na Fase 2 | Fases 2 e 9 |
| 3 | A @wsasistemas.ia tem página do Facebook ligada? | Wagner | Fase 9 |
| 4 | Avatar: HeyGen ou fal.ai? | Wagner | Fase 7 |
| 5 | Chave Gemini: usar a que já existe em outros projetos WSA ou criar uma? | Wagner | Fase 4 |
| 6 | Teto de gasto mensal inicial com IA paga (sugestão: US$ 30) | Wagner | Fase 7 |
| 7 | O Chatfyre aceita chamadas de backend (MCP por HTTP) com o mesmo token do script? | Teste na Fase 5 | Fase 5 |
| 8 | Por quanto tempo guardar oportunidades do radar com legendas de terceiros (LGPD)? **Respondida em 28/10/2026: 30 dias; das que viraram contato fica só o link.** | Wagner | Fase 9 |
