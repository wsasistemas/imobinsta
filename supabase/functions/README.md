# Edge Functions do imobinsta

Rodam no Supabase ikvj (`ikvjaowvpvxojvcfwnct`). São o **único** lugar que fala com a Meta.

| Função | O que faz | JWT |
|---|---|---|
| `ig-oauth` | POST: devolve o link do login da Meta. GET: recebe o retorno, guarda o token no Vault e marca a conexão como conectada | **desligado** (a Meta volta sem JWT; o POST valida o JWT no código) |
| `ig-sync` | Importa posts, métricas por post e seguidores. Só lê, não altera nada na conta. Roda todo dia às 06:00 (pg_cron) | **desligado** (o pg_cron chama com o cabeçalho `x-cron-segredo`, conferido no Vault; o botão manda o JWT, conferido no código) |
| `ia-texto` | IA de texto (Gemini): lê link, escreve o prompt adaptado, gera os slides em JSON + legenda, edita por chat e grava a chave do Gemini no Vault. Toda chamada vai para `geracoes_ia` | **ligado** (sempre chamado pelo app com sessão) |
| `chatfyre` | Ponte com o Chatfyre (MCP por HTTP, JSON-RPC). Guarda o pacote do script no Vault, renova o token e lê automações/métricas. Criar e ativar automação entra na Etapa 5.3 (sempre pausada) | **ligado** |
| `google-oauth` | POST: devolve o link do consentimento do Google (escopo `drive.file`) ou testa o acesso (`acao: "testar"`). GET: recebe o retorno, guarda o refresh token no Vault e marca a conexão `google` como conectada | **desligado** (o Google volta sem JWT; o POST valida o JWT no código) |
| `google-drive` | Ponte com o Google Vids: ação `vids` cria no Drive a pasta do roteiro (roteiro.txt, legenda.txt, imagens, `prontos/`); ação `buscar` importa o MP4 de `prontos/` para o Banco de mídias | **ligado** |
| `ig-publicar` | Publica post único e carrossel (containers → `media_publish`), agenda, cancela e processa a fila (pg_cron a cada 5 min) | **desligado** (o pg_cron chama com `x-cron-segredo`; o app manda o JWT, conferido no código) |

## Secrets necessários (painel → Edge Functions → Secrets)

`META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`. Google (Fase 11): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
Opcionais da IA: `GEMINI_MODELO` (padrão `gemini-3.8-flash`) e `GEMINI_API_KEY` (só se a conta não tiver chave própria no Vault).
Os secrets `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já vêm prontos do Supabase.
`APP_ORIGENS` é opcional: domínios extras do estúdio, separados por vírgula. Os previews
`imobinsta-*.vercel.app` e o `localhost` já são aceitos.

## Publicar (PowerShell, na raiz do projeto)

```powershell
npx supabase login                       # abre o navegador uma vez
npx supabase functions deploy ig-oauth --project-ref ikvjaowvpvxojvcfwnct --no-verify-jwt
npx supabase functions deploy ig-sync  --project-ref ikvjaowvpvxojvcfwnct --no-verify-jwt
npx supabase functions deploy ia-texto --project-ref ikvjaowvpvxojvcfwnct
npx supabase functions deploy chatfyre --project-ref ikvjaowvpvxojvcfwnct
npx supabase functions deploy ig-publicar --project-ref ikvjaowvpvxojvcfwnct --no-verify-jwt
npx supabase functions deploy google-oauth --project-ref ikvjaowvpvxojvcfwnct --no-verify-jwt
npx supabase functions deploy google-drive --project-ref ikvjaowvpvxojvcfwnct
```

Antes de publicar, as migrations `20261026030000_fase2_instagram.sql` e `20261027010000_fase2_sync_diario.sql`
precisam estar aplicadas no SQL Editor.

Conferir o sync diário: `select * from cron.job_run_details order by start_time desc limit 5;`
e `select status_code, content from net._http_response order by created desc limit 5;`

## Checar tipos

```powershell
cd supabase/functions; npx deno@2.9.6 check ig-oauth/index.ts ig-sync/index.ts ia-texto/index.ts chatfyre/index.ts ig-publicar/index.ts
```
