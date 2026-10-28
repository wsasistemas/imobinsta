# Plano em fases — Estúdio imobinsta

Base: `docs/PRD-v2-estudio.md` e o mockup aprovado em `docs/mockups/estudio-imobinsta.html`.

**Regras de execução:**
- Uma fase por vez. A próxima só começa com a anterior **100% feita** e aprovada pelo Wagner.
- Cada item do checklist é binário: feito ou não feito. Não existe "parcialmente feito".
- Toda fase termina com: build sem erro, conferência visual (Playwright) quando houver tela, checklist preenchido e registro no Cerebro.
- Migrations sempre aditivas. O SQL em produção é rodado pelo Wagner no SQL Editor (o modo automático bloqueia escrita em produção).

| Fase | Entrega | Depende de |
|---|---|---|
| 0 | Chatfyre conectado, inventário e diagnóstico | — |
| 1 | Fundação: app, login, schema, layout | 0 |
| 2 | Instagram oficial: OAuth, sync de posts e métricas, Analytics | 1 |
| 3 | Banco de mídias e Biblioteca | 1 |
| 4 | Criar imagem/carrossel (wizard + editor + IA texto) | 3 |
| 5 | Publicar, agendar e automação Chatfyre | 2, 4 |
| 6 | Calendário e pautas IA | 5 |
| 7 | IA paga: imagem, avatar, teto de gasto | 4 |
| 8 | Reels de fotos (Remotion local) | 3, 5 |
| 9 | Radar de prospecção | 2 |

---

## Fase 0: Chatfyre e diagnóstico (quase concluída)

- [x] Chatfyre conectado com token (`scripts/chatfyre-token.ps1`)
- [x] Conta confirmada: @wsasistemas.ia
- [x] `docs/chatfyre-tools.md` com as ferramentas e retornos reais
- [x] Diagnóstico parcial em `reports/2026-10-25-diagnostico.md`
- [x] Automação "QUERO" criada e pausada (fluxo v3 publicado)
- [x] Migration do schema `imobinsta` criada e testada
- [x] Schema aplicado no Supabase (o Wagner roda no SQL Editor)
- [ ] Métricas por post. Fica para a Fase 2, pela API oficial; o Chatfyre dá 403.

---

## Fase 1: Fundação

**Entrega:** app React rodando localmente e na Vercel, com login, o menu lateral do mockup e as tabelas base.

- [x] Projeto Vite + React + TS + Tailwind + shadcn criado em `app/`
- [x] Design system Apple HIG do mockup v2 convertido em tokens Tailwind:
  - cores de sistema dark/light;
  - fonte SF com Inter de reserva;
  - grade de 8 pt e raios concêntricos;
  - botões em cápsula de 44 pt e controle segmentado;
  - toggle iOS e ícones Lucide com traço 1.75 em blocos coloridos.
- [x] Layout com sidebar idêntica ao mockup e rotas vazias para as 13 telas
- [x] Supabase client apontando para o schema `imobinsta`, com variáveis em `.env.local`
- [x] Migration com `contas`, `membros` e `conexoes` + RLS por `conta_id` + função `eh_membro(conta_id)`
- [x] RLS testada em transação desfeita, simulando o dono, um outro usuário e o anon
- [x] Login funcionando, com redirecionamento se o usuário não for membro
- [x] Tela Conexões e custos lendo `conexoes` (status real; chaves nunca no front)
- [x] Build sem erro + conferência visual 1440 px e 390 px
- [x] Deploy de preview na Vercel

**Prompt da fase:**
> Leia `CLAUDE.md`, `docs/PRD-v2-estudio.md` e `docs/PLANO-fases.md`. Execute a Fase 1.
> Crie o app em `app/` (Vite + React + TS + Tailwind + shadcn), reproduzindo o layout e o tema do
> mockup `docs/mockups/estudio-imobinsta.html`. Crie a migration aditiva com `contas`, `membros` e
> `conexoes` e as RLS por `conta_id`, e teste as RLS numa transação desfeita. Implemente o login
> do Supabase e a tela Conexões e custos. Não chame nenhuma API externa nesta fase. Termine com
> o checklist binário da Fase 1.

---

## Fase 2: Instagram oficial

**Entrega:** a conta conectada pela API da Meta, com posts e métricas reais no Analytics e na Biblioteca.

- [x] App criado no developers.facebook.com (tipo decidido: Instagram Login ou Facebook Login, ver PRD pergunta 2)
- [x] Edge Function `ig-oauth`: troca o código, gera o token de longa duração e salva no Vault
- [x] Token: pg_cron marca vencido + aviso 10 dias antes com "Conectar de novo" (a Meta não renova o token de usuário sem nova autorização; aprovado em 27/10/2026)
- [x] Migration `metricas_post`, `metricas_conta` e `posts` (campos de publicação)
- [x] Edge Function `ig-sync`: importa posts, insights por post e seguidores, com snapshot diário
- [x] Os 7 posts reais aparecem com alcance, curtidas e salvamentos. O 403 do Chatfyre fica resolvido.
- [x] Tela Analytics com KPIs, gráfico de seguidores e ranking (dados reais, sem mock)
- [x] Biblioteca listando os posts publicados vindos do Instagram
- [ ] Conferência: 5 posts batem com o app do Instagram (100%)

**Prompt da fase:**
> Fase 2 do `docs/PLANO-fases.md`. Antes de codar, confirme na documentação atual da Meta quais
> permissões e qual tipo de login dão: publicação de conteúdo, insights por post e da conta, e
> busca por hashtag. Proponha o tipo de app e espere minha aprovação. Depois implemente `ig-oauth`,
> `ig-sync`, as migrations e as telas Analytics e Biblioteca (só os publicados). Tokens só no Vault.

---

## Fase 3: Banco de mídias e Biblioteca

- [x] Bucket `imobinsta-midias` com políticas por `conta_id`, separando privado e publicado
- [x] Migration `midias` (pasta, tipo, dimensões, origem)
- [x] Upload com arrastar e soltar, até 100 MB, com barra de progresso
- [x] Abas Tudo / Imagens / Vídeos / Logos / Trilhas / Prints
- [x] Biblioteca com abas Rascunhos / Agendados / Publicados, pastas e busca
- [x] Conferência visual igual ao mockup

**Prompt da fase:**
> Fase 3 do `docs/PLANO-fases.md`: bucket, migration `midias`, telas Banco de mídias e Biblioteca
> completas, iguais ao mockup. Teste as políticas do Storage com dois usuários.

---

## Fase 4: Criar imagem e carrossel

- [x] Migration `templates`, `post_slides` e `geracoes_ia` (`20261027030000_fase4_criar.sql`, RLS testada em PGlite: 30/30)
- [x] 3 templates HTML da WSA (Neon azul, Escuro, Docerias) com campos editáveis
- [x] Wizard: Formato → Conteúdo → Prompt adaptado (igual ao mockup)
- [x] Edge Function `ia-texto` (Gemini): prompt adaptado, campos dos slides em JSON e legenda
- [x] "A partir de link": a Edge Function lê título, descrição e corpo da página
- [x] Editor: lista de slides, canvas, edição de texto ao clicar, chat IA que devolve JSON de alterações
- [x] Render para PNG 1080×1350 no navegador, salvo em `midias`
- [x] Cada chamada de IA registrada em `geracoes_ia` (custo 0 no Gemini gratuito)
- [x] Teste real com o Gemini (Wagner, 27/10/2026: link, prompt, gerar, chat do editor, Finalizar e Biblioteca OK)

**Para ligar em produção (Wagner):**
1. SQL Editor do ikvj: rodar `supabase/migrations/20261027030000_fase4_criar.sql`.
2. `npx supabase functions deploy ia-texto --project-ref ikvjaowvpvxojvcfwnct`
3. Conexões e custos → card Gemini → colar a chave do AI Studio (fica no Vault).

**Prompt da fase:**
> Fase 4 do `docs/PLANO-fases.md`. A IA nunca gera imagem nesta fase: ela só preenche JSON de
> templates HTML. Implemente o wizard, a Edge Function `ia-texto` (Gemini, chave no Vault), o
> editor com chat e o render para PNG. Valide o JSON da IA com Zod antes de aplicar.

---

## Fase 5: Publicar, agendar e Chatfyre

- [x] Tela Publicar: preview do Instagram, legenda editável, painel da automação (`/criar/publicar/:id`)
- [x] Edge Function `ig-publicar`: post único e carrossel (containers → publish), salvando `ig_media_id` e permalink (JPEG gerado no navegador; a Meta não aceita PNG)
- [x] Agendamento: `status = agendado` + pg_cron a cada 5 min chamando `ig-publicar` (migration 20261027040000, testada no PGlite 20/20)
- [x] Edge Function `chatfyre`: cliente JSON-RPC (MCP por HTTP) com Bearer e renovação de token (testada com o pacote em 27/10: 12 ferramentas, 5 de escrita)
- [x] Depois de publicar, a automação é criada com `media_id` do post, **pausada**, e fica em `automacoes` (`_shared/automacao.ts`; "só para quem segue" vira fluxo em rascunho)
- [x] Botão "Ativar automação" (`definir_status_automacao`), com confirmação, só para o dono (publica o fluxo junto)
- [x] Tela Automações com o funil (`metricas_do_fluxo`) e a lista (do estúdio + as criadas fora dele, só leitura)
- [ ] Teste real: 1 post publicado + automação ativa + 1 comentário "QUERO" de teste recebendo a DM

**Etapas da Fase 5:** 5.1 Chatfyre pelo backend · 5.2 publicar e agendar · 5.3 automação ligada ao post e tela Automações.
A 5.3 depende de ver os parâmetros reais de `criar_automacao`/`montar_fluxo`/`definir_status_automacao`,
que só aparecem com o token de escrita (`automacoes:escrever`).

**Para ligar em produção (Wagner):**
1. SQL Editor do ikvj: rodar `supabase/migrations/20261027040000_fase5_publicar.sql`.
2. Numa rede sem o Fortinet do escritório (ex.: 4G do celular): `.\scripts\chatfyre-token.ps1 -Exportar`.
3. Conexões e custos → Chatfyre → Colar pacote → Salvar. Depois "Copiar lista técnica" e mandar no chat.

**Prompt da fase:**
> Fase 5 do `docs/PLANO-fases.md`. Primeiro confirme se o servidor MCP do Chatfyre aceita chamada
> direta por HTTP (initialize + tools/call) com o token do `.env`. Implemente `ig-publicar`, o
> agendamento e a Edge Function `chatfyre`. Toda automação nasce pausada e só ativa com o meu OK
> na tela. Nunca crie automação sem `media_id`.

---

## Fase 6: Calendário e pautas

- [x] Migration `pautas` (20261027050000, testada no PGlite 16/16)
- [x] Calendário mensal com pautas, posts agendados e publicados (grade no computador, agenda no celular)
- [x] "Recomendações IA": 8 pautas (4 semanas × 2, terça e sexta), alternando produto e formato, a partir do ranking da Fase 2 (`ia-texto` ação `pautas`; teste real espera o crédito do AI Studio)
- [x] Pauta → "Criar post" abre o wizard já preenchido (`/criar/imagem?pauta=<id>`) e liga o rascunho à pauta

**Etapas da Fase 6:** 6.1 pautas e calendário · 6.2 Recomendações IA (Gemini; espera o crédito do AI Studio).

**Para ligar em produção (Wagner):** SQL Editor do ikvj: rodar `supabase/migrations/20261027050000_fase6_pautas.sql`.

**Pendente da Fase 5:** teste real (publicar 1 post, ativar a automação, comentar "QUERO") depois do crédito do AI Studio.

---

## Fase 7: IA paga (imagem, avatar, teto)

- [x] Tela Conexões: campos de chave OpenAI, HeyGen e fal.ai (gravam no Vault pela Edge Function `ia-imagem`, ação `chave`)
- [x] Teto de gasto: `config_ia` + `gasto_ia_mes()` (migration 20261027060000, PGlite 11/11); a `ia-imagem` bloqueia no teto e pede confirmação acima do valor por geração (padrão US$ 30 / US$ 2)
- [x] `ia-imagem` (OpenAI GPT Image ou fal.ai) no fluxo "Imagem gerada por IA" (`/criar/ia-imagem`): a foto vira fundo do template (`fundo_midia`), título e logo por cima
- [x] Migration `avatares` e `roteiros` (20261027070000, com `posts.video_midia_id` e a fila de Reels; PGlite 24/24)
- [x] Tela Meus avatares: cadastro do avatar treinado no provedor + registro do consentimento (só o dono)
- [x] Wizard Vídeo com avatar: roteiro (Gemini, `ia-texto` ação `roteiro`) → avatar/voz → `ia-avatar` (HeyGen, com teto) → vídeo no banco de mídias → Publicar como Reels
- [x] Publicação de Reels em `ig-publicar` (container REELS; espera ~1 min e, se a Meta ainda processa, a fila do pg_cron termina)

**Etapas da Fase 7:** 7.1 chaves, teto e imagem por IA · 7.2 avatar (HeyGen), roteiro e Reels.

**Para ligar em produção (Wagner):** SQL Editor do ikvj: rodar `supabase/migrations/20261027060000_fase7_ia_paga.sql`
e depois `20261027070000_fase7_avatar_reels.sql`; em Conexões, colar a chave da OpenAI (ou fal.ai) e a da HeyGen e conferir o teto.
**Ordem obrigatória:** só depois da migration 20261027070000 publicar o `ig-publicar` novo
(`supabase functions deploy ig-publicar --no-verify-jwt`). A versão nova lê `video_midia_id`/`ig_container_id`
e quebraria a publicação num banco sem essas colunas. Em 27/10 a produção ficou com a versão anterior (commit f18f036).

---

## Fase 8: Reels de fotos (render local) · substituída pela Fase 12.2 (vídeo no navegador, decisão de 28/10/2026)

- [ ] Projeto Remotion em `render/` com 2 templates (fotos + texto + legenda + trilha)
- [ ] Comando `npm run render -- <post_id>` lê o roteiro no Supabase, renderiza o MP4 e envia ao Storage
- [ ] Botão no estúdio: "Gerar no meu PC" mostra o comando e acompanha o status
- [ ] Reels publicado pela Fase 5

---

## Fase 9: Radar de prospecção

- [ ] Confirmar a busca por hashtag no app da Meta (Facebook Login for Business, modo Desenvolvimento): primeiro "Buscar
  agora" real (Wagner). Se a Meta recusar, a tela mostra o erro na hashtag (recurso Instagram Public Content Access)
- [x] Migration `20261028010000_fase9_radar.sql`: `radar_hashtags` (até 30 ativas, trigger) e `radar_oportunidades`, RLS por
  membro, RPC `radar_contato` (20 por dia e 3 min entre contatos, no servidor), retenção de 30 dias (LGPD, decisão do
  Wagner em 28/10: apaga o que tem mais de 30 dias; dos contatos fica só o link) e pg_cron (busca segunda 07:00, limpeza
  diária). PGlite 23/23 + mutação detectada
- [x] `ig-hashtag`: `ig_hashtag_search` + `top_media` + `recent_media`, até 25 novas por hashtag, ignora posts próprios;
  botão "Buscar agora" e pg_cron semanal (mesmo segredo do sync diário)
- [x] `ia-texto` ação `radar`: lê até 15 legendas por vez, marca relevância, dor, produto WSA e sugere o comentário
- [x] Tela Radar igual ao mockup: hashtags (pausar, remover), abas Novas / Em contato / Descartadas, abordagem com
  comentário editável, conteúdo para indicar (último post publicado do produto), "Copiar e abrir post" e contador do limite.
  "Salvar na lista" do mockup virou "Descartar"/"Recuperar"
- [x] **Nenhum envio automático** de comentário ou DM: a Meta só é lida; o comentário é colado e publicado pelo Wagner

**Para ligar (Wagner):** SQL Editor: `20261028010000_fase9_radar.sql`. Publicar `ig-hashtag` (`--no-verify-jwt`) e `ia-texto`.
Depois: Radar → adicionar hashtags → Buscar agora.

---

## Fase 10: DNA da marca (o "Pomelli" do estúdio) · aprovada em 27/10/2026

Detalhes em `docs/PLANO-google-vids-dna.md` e mockup `docs/mockups/google-vids-dna.html`.
- [x] Migration `marca_dna`, `campanhas`, `pautas.campanha_id` e template `marca` (20261027080000, PGlite 14/14)
- [x] `ia-texto` ação `dna`: lê o site (cores, fontes, imagens → Banco de mídias, textos de até 4 páginas) e o Gemini resume tom, público e pilares
- [x] DNA anexado a toda geração de texto (legenda, carrossel, roteiro, pautas, campanhas)
- [x] Tela DNA da marca (editável, só o dono) e card "Google · grátis" em Conexões
- [x] Template "Marca" com as cores do DNA
- [x] Campanhas sugeridas (`campanhas`) → aprovar cria pautas no Calendário (`aprovar_campanha`) → post editável pelo wizard
- [ ] Teste real (espera o crédito do AI Studio e a migration)

**Para ligar (Wagner):** SQL Editor: `20261027080000_fase10_marca_dna.sql`. Depois: DNA da marca → informar o site → Ler site.

## Fase 11: Google Vids pelo Drive e Veo 3.1 · aprovada em 27/10/2026 (conta Google pessoal)

- [x] App OAuth no Google Cloud (conta pessoal, modo de teste) e secrets `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (Wagner, 27/10)
- [x] Etapa 11.1 no código: migration `20261027090000_fase11_google.sql` (provedor `google`, PGlite ok), Edge Function
  `google-oauth` (consentimento, refresh token no Vault, ação `testar`) e "Conectar Google" em Conexões → Google · grátis
- [ ] Etapa 11.1 ligada: rodar a migration, publicar a `google-oauth` e conectar uma vez (Wagner)
- [x] Etapa 11.2 no código: migration `20261027100000_fase11_vids.sql` (ids do Drive no roteiro), Edge Function
  `google-drive` ação `vids` (pasta `Estúdio imobinsta/Vids/<título · dd-mm>` com roteiro.txt, legenda.txt, logo,
  até 6 imagens da pasta do produto e subpasta `prontos/`) e card "Ou monte no Google Vids" na tela do roteiro
- [ ] Etapa 11.2 ligada: rodar a migration e publicar a `google-drive` (Wagner); testar com um roteiro real
- [x] Etapa 11.3 no código (botão): `google-drive` ação `buscar` pega o vídeo mais recente de `prontos/` (até 100 MB,
  MP4/MOV/WebM), copia para o Banco de mídias (pasta Vids, nome = id do arquivo no Drive, sem duplicar) e marca o
  roteiro como pronto → "Criar Reels e publicar". Sem migration nova
- [ ] Importação automática a cada hora (pg_cron): fica para depois do teste real do botão
- [ ] Veo 3.1 pela chave do Gemini, dentro do teto de gasto (pago por segundo)

**Para ligar a 11.1 (Wagner):** SQL Editor: `20261027090000_fase11_google.sql`. PowerShell:
`npx supabase functions deploy google-oauth --project-ref ikvjaowvpvxojvcfwnct --no-verify-jwt`.
Depois: Conexões → Google · grátis → Conectar Google. Em modo de teste o Google invalida o acesso em 7 dias.

**Para ligar a 11.2 (Wagner):** SQL Editor: `20261027100000_fase11_vids.sql` (antes de publicar o front: a tela do
roteiro passa a ler `drive_url`). PowerShell: `npx supabase functions deploy google-drive --project-ref ikvjaowvpvxojvcfwnct`.

---

## Fase 12: Mídia real (fotos e vídeos em post, carrossel, Reels e Stories) · aprovada em 28/10/2026

Detalhes em `docs/PLANO-midia-real.md` e mockup `docs/mockups/midia-real.html`.
- [x] 12.1 Slides `foto` e `video` (mídia do Banco em tela cheia, texto opcional, enquadramento, escurecer), seletor do
  Banco no editor (com envio do computador), "Foto de fundo" nos slides de template, entrada "Post com suas fotos"
  (`/criar/fotos`) e vídeo MP4/MOV como item do carrossel na `ig-publicar`. Sem migration
- [ ] 12.1 ligada: publicar a `ig-publicar` (Wagner) e testar um carrossel com foto e vídeo
- [x] 12.2 Motor de vídeo no navegador (Reels): tela `/criar/reels` com cenas de foto (zoom, panorâmica, parado), trecho
  de vídeo (início/fim, som opcional) e CTA na cor do DNA; texto por cena, trilha do Banco, logo no canto, corte ou
  esmaecer; MP4 1080 × 1920, 30 fps, H.264 + AAC (Mediabunny, no lugar do `mp4-muxer` descontinuado); vai para o
  Banco (pasta Reels) e abre no Publicar. Testado no Chrome: 16 s de vídeo em 4 s, áudio, corte de vídeo e cancelar.
- [ ] 12.2 ligada: publicar um Reels montado de verdade (Wagner), com um vídeo do Banco e uma trilha
- [ ] 12.2 "Roteiro com IA" (ordem e texto das cenas): vai junto com a 12.4
- [ ] 12.3 Stories
- [ ] 12.4 IA escolhe e escreve

---

## Fase 13: vídeo explicativo com avatar + telas do sistema · aprovada em 28/10/2026

Detalhes em `docs/PLANO-video-avatar.md` e mockup `docs/mockups/video-avatar.html`.
- [x] Pré-requisito: HeyGen na API v3 e looks da própria conta em Meus avatares (5ecc168). As rotas v1/v2 são desligadas em 01/11/2026
- [x] 13.1 no código: migration `20261028020000_fase13_roteiro_cenas.sql` (`roteiros.tipo/objetivo/projeto_json` e tabela
  `roteiro_cenas` com RLS, guarda de cena em geração; PGlite 16/16 + mutação detectada), `ia-texto` ação `roteiro_cenas`
  e tela `/criar/explicativo` (configuração, roteiro com IA, editor de cenas com fala, layout, tela do sistema, ordem)
- [ ] 13.1 ligada: rodar a migration e publicar a `ia-texto` (Wagner); escrever o primeiro roteiro real
- [ ] 13.2 Avatar por cena na HeyGen (MP4 no apresentador, WebM transparente nos demais, SRT, custo e teto)
- [ ] 13.3 Montagem no navegador (avatar posicionável, legenda, logo, trilha, 9:16/4:5/1:1/16:9) → Publicar

## Fase 14: LinkedIn · perfil pessoal · aprovada em 28/10/2026
- [ ] App no LinkedIn Developer Portal com "Share on LinkedIn" e "Sign In with LinkedIn using OpenID Connect" (Wagner)
- [ ] `li-oauth` (conexão, token no Vault) e `li-publicar` (upload do vídeo em partes + post no perfil)
- [ ] Legenda adaptada pela IA para o LinkedIn

