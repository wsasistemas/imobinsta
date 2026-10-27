-- imobinsta — Fase 5: publicar e agendar no Instagram, automações do Chatfyre.
-- Aditiva e idempotente. Depende de 20261027030000_fase4_criar.sql e 20261027010000_fase2_sync_diario.sql.
--
-- Quem muda status de post (agendado/publicando/publicado/erro) é só a Edge Function ig-publicar
-- (service_role). O membro continua editando apenas rascunhos.

-- 1. Post: configuração da automação escolhida na tela Publicar -------------------------------
-- Formato: {palavra, resposta_publica, dm, botao, so_seguidores, link, lembrete_min}. Sem segredo.
alter table imobinsta.posts add column if not exists automacao_json jsonb;
alter table imobinsta.posts add column if not exists tentativas integer not null default 0;
grant update (automacao_json) on imobinsta.posts to authenticated;

-- O gatilho da Fase 4 passa a proteger também a configuração da automação fora do rascunho.
create or replace function imobinsta.posts_so_rascunho_editavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and old.status <> 'rascunho' and (
       new.formato, new.objetivo, new.produto, new.abordagem, new.origem, new.link_url, new.instrucoes,
       new.prompt, new.template_id, new.mostrar_logo, new.criar_automacao, new.legenda, new.automacao_json)
     is distinct from (
       old.formato, old.objetivo, old.produto, old.abordagem, old.origem, old.link_url, old.instrucoes,
       old.prompt, old.template_id, old.mostrar_logo, old.criar_automacao, old.legenda, old.automacao_json) then
    raise exception 'Só rascunhos podem ser editados (status atual: %)', old.status using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

create index if not exists posts_fila_idx on imobinsta.posts (agendado_para) where status = 'agendado';

-- 2. Automações do Chatfyre (espelho local; quem grava são as Edge Functions) -----------------
create table if not exists imobinsta.automacoes (
  id            uuid primary key default gen_random_uuid(),
  conta_id      uuid not null references imobinsta.contas(id) on delete cascade,
  post_id       uuid references imobinsta.posts(id) on delete set null,
  chatfyre_id   text,
  nome          text,
  palavra       text,
  status        text not null default 'pausada' check (status in ('pausada', 'ativa', 'erro')),
  versao_fluxo  integer,
  config_json   jsonb not null default '{}'::jsonb,
  erro          text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (conta_id, chatfyre_id)
);
create index if not exists automacoes_conta_idx on imobinsta.automacoes (conta_id, criado_em desc);

revoke all on imobinsta.automacoes from anon, public, authenticated;
grant select on imobinsta.automacoes to authenticated;
grant all on imobinsta.automacoes to service_role;
alter table imobinsta.automacoes enable row level security;
drop policy if exists automacoes_ler on imobinsta.automacoes;
create policy automacoes_ler on imobinsta.automacoes for select to authenticated using (imobinsta.eh_membro(conta_id));

-- 3. Fila de agendados: pg_cron a cada 5 min chama o ig-publicar ------------------------------
-- Usa o mesmo segredo do agendador criado na Fase 2 (imobinsta_sync_cron_segredo, conferido por
-- imobinsta.sync_cron_confere). Ninguém digita nem vê o segredo.
create or replace function imobinsta.publicar_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_segredo text;
begin
  -- Publicação que travou no meio (a função caiu): vira erro para o Wagner conferir no Instagram.
  update imobinsta.posts
     set status = 'erro', erro = 'A publicação foi interrompida. Confira no Instagram se o post saiu antes de tentar de novo.'
   where status = 'publicando' and atualizado_em < now() - interval '15 minutes';

  if not exists (select 1 from imobinsta.posts where status = 'agendado' and agendado_para <= now()) then
    return;
  end if;

  select d.decrypted_secret into v_segredo from vault.decrypted_secrets d where d.name = 'imobinsta_sync_cron_segredo';
  perform net.http_post(
    url     := 'https://ikvjaowvpvxojvcfwnct.supabase.co/functions/v1/ig-publicar',
    body    := '{"acao": "fila"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-segredo', v_segredo),
    timeout_milliseconds := 120000
  );
end;
$$;
revoke all on function imobinsta.publicar_tick() from public, anon, authenticated;

select cron.schedule('imobinsta-publicar-agendados', '*/5 * * * *', 'select imobinsta.publicar_tick()');

notify pgrst, 'reload schema';
