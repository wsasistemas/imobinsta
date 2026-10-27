-- imobinsta — Fase 2: sync diário do Instagram (pg_cron → ig-sync) e expiração do token.
-- Aditiva e idempotente. Depende de 20261026030000_fase2_instagram.sql.
-- Padrão: segredo gerado no próprio Vault, conferido por RPC só service_role
-- (Cerebro: supabase-pg-cron-chamar-edge-function-com-segredo-gerado-no-vault).

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 1. Segredo do agendador: gerado aqui, ninguém digita nem vê ---------------------------
do $$ begin
  if not exists (select 1 from vault.secrets s where s.name = 'imobinsta_sync_cron_segredo') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'imobinsta_sync_cron_segredo',
      'Cabeçalho x-cron-segredo do pg_cron para a Edge Function ig-sync');
  end if;
end $$;

create or replace function imobinsta.sync_cron_confere(p_segredo text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_segredo <> '' and p_segredo = (
    select d.decrypted_secret from vault.decrypted_secrets d where d.name = 'imobinsta_sync_cron_segredo'), false);
$$;
revoke all on function imobinsta.sync_cron_confere(text) from public, anon, authenticated;
grant execute on function imobinsta.sync_cron_confere(text) to service_role;

-- 2. Tique diário ------------------------------------------------------------------------
create or replace function imobinsta.sync_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_segredo text;
begin
  -- Token vencido: a tela pede para conectar de novo (o ig-sync também marca ao receber erro 190).
  update imobinsta.conexoes
     set status = 'expirado', detalhe = 'Token da Meta venceu. Conecte de novo.', atualizado_em = now()
   where provedor = 'instagram' and status = 'conectado' and expira_em < now();

  -- Sem conta conectada, não dispara (evita erro a cada execução).
  if not exists (select 1 from imobinsta.conexoes where provedor = 'instagram' and status = 'conectado') then
    return;
  end if;

  select d.decrypted_secret into v_segredo from vault.decrypted_secrets d where d.name = 'imobinsta_sync_cron_segredo';
  perform net.http_post(
    url     := 'https://ikvjaowvpvxojvcfwnct.supabase.co/functions/v1/ig-sync',
    body    := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-segredo', v_segredo),
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function imobinsta.sync_tick() from public, anon, authenticated;

-- 3. Agenda: 09:00 UTC = 06:00 em Brasília. Mesmo nome = atualiza o job (idempotente). ---
select cron.schedule('imobinsta-ig-sync-diario', '0 9 * * *', 'select imobinsta.sync_tick()');
