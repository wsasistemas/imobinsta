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

- [ ] Migration `pautas`
- [ ] Calendário mensal com pautas, posts agendados e publicados
- [ ] "Recomendações IA": 8 pautas (4 semanas × 2), alternando produto e formato, a partir do ranking da Fase 2
- [ ] Pauta → "Criar post" abre o wizard já preenchido

---

## Fase 7: IA paga (imagem, avatar, teto)

- [ ] Tela Conexões: campos de chave OpenAI, HeyGen e fal.ai (gravam no Vault pela Edge Function)
- [ ] `uso-ia`: soma o gasto do mês, bloqueia ao atingir o teto e pede confirmação acima do valor por geração
- [ ] `ia-imagem` (OpenAI GPT Image ou fal.ai) no fluxo "Imagem gerada por IA"
- [ ] Migration `avatares` e `roteiros`
- [ ] Tela Meus avatares: cadastro do avatar treinado no provedor + registro do consentimento
- [ ] Wizard Vídeo com avatar: roteiro (Gemini) → avatar/voz → `ia-avatar` → vídeo no banco de mídias → Publicar como Reels
- [ ] Publicação de Reels em `ig-publicar` (container de vídeo + espera do processamento)

---

## Fase 8: Reels de fotos (render local)

- [ ] Projeto Remotion em `render/` com 2 templates (fotos + texto + legenda + trilha)
- [ ] Comando `npm run render -- <post_id>` lê o roteiro no Supabase, renderiza o MP4 e envia ao Storage
- [ ] Botão no estúdio: "Gerar no meu PC" mostra o comando e acompanha o status
- [ ] Reels publicado pela Fase 5

---

## Fase 9: Radar de prospecção

- [ ] Confirmar a busca por hashtag no tipo de app da Meta escolhido (PRD pergunta 2)
- [ ] Migration `radar_hashtags` e `radar_oportunidades`
- [ ] `ig-hashtag`: busca semanal (até 30 hashtags), guarda permalink e legenda
- [ ] `ia-texto`: classifica a dor, o produto WSA e sugere um comentário
- [ ] Tela Radar igual ao mockup, com "Copiar e abrir post" e limite de 20 por dia
- [ ] **Nenhum envio automático** de comentário ou DM
