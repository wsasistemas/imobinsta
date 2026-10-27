# Edge Functions do imobinsta

Rodam no Supabase ikvj (`ikvjaowvpvxojvcfwnct`). São o **único** lugar que fala com a Meta.

| Função | O que faz | JWT |
|---|---|---|
| `ig-oauth` | POST: devolve o link do login da Meta. GET: recebe o retorno, guarda o token no Vault e marca a conexão como conectada | **desligado** (a Meta volta sem JWT; o POST valida o JWT no código) |
| `ig-sync` | Importa posts, métricas por post e seguidores. Só lê, não altera nada na conta | ligado |

## Secrets necessários (painel → Edge Functions → Secrets)

`META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`.
Os secrets `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já vêm prontos do Supabase.
`APP_ORIGENS` é opcional: domínios extras do estúdio, separados por vírgula. Os previews
`imobinsta-*.vercel.app` e o `localhost` já são aceitos.

## Publicar (PowerShell, na raiz do projeto)

```powershell
npx supabase login                       # abre o navegador uma vez
npx supabase functions deploy ig-oauth --project-ref ikvjaowvpvxojvcfwnct --no-verify-jwt
npx supabase functions deploy ig-sync  --project-ref ikvjaowvpvxojvcfwnct
```

Antes de publicar, a migration `20261026030000_fase2_instagram.sql` precisa estar aplicada no SQL Editor.

## Checar tipos

```powershell
cd supabase/functions; npx deno@2.9.6 check ig-oauth/index.ts ig-sync/index.ts
```
