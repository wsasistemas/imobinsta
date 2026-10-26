-- imobinsta — cria o schema do Estúdio imobinsta no Supabase compartilhado (ikvjaowvpvxojvcfwnct).
-- Aditiva e idempotente: pode rodar mais de uma vez. Não altera nenhum outro schema.
-- Rode inteira no SQL Editor.

-- 1. Schema --------------------------------------------------------------------------
create schema if not exists imobinsta;
comment on schema imobinsta is 'Estúdio imobinsta: conteúdo, publicação no Instagram e automações (WSA Sistemas de IA)';

-- 2. Permissões: anon fechado, authenticated e service_role com acesso -----------------
revoke all on schema imobinsta from anon, public;
grant usage on schema imobinsta to authenticated, service_role;

-- Tudo o que for criado depois no schema já nasce com os grants certos (anon fica de fora).
alter default privileges in schema imobinsta revoke all on tables    from anon, public;
alter default privileges in schema imobinsta revoke all on sequences from anon, public;
alter default privileges in schema imobinsta revoke all on functions from anon, public;
alter default privileges in schema imobinsta grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema imobinsta grant all on tables    to service_role;
alter default privileges in schema imobinsta grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema imobinsta grant execute on functions to authenticated, service_role;

-- 3. Expor na API (PostgREST) ACRESCENTANDO à lista atual, sem tirar os outros apps -----
-- No ikvj a lista gravada no authenticator tem prioridade sobre o painel.
do $$
declare v_atual text;
begin
  select split_part(c, '=', 2) into v_atual
  from pg_roles r, unnest(r.rolconfig) c
  where r.rolname = 'authenticator' and c like 'pgrst.db_schemas=%';

  -- Sem lista gravada, quem manda é o painel: não cria lista nova aqui, senão os outros apps saem da API.
  if nullif(btrim(v_atual), '') is null then
    raise notice 'authenticator sem pgrst.db_schemas: marque "imobinsta" no painel (Integrations > Data API > Exposed schemas).';
  elsif not ('imobinsta' = any (string_to_array(replace(v_atual, ' ', ''), ','))) then
    execute format('alter role authenticator set pgrst.db_schemas = %L', v_atual || ', imobinsta');
  end if;
end $$;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';

-- 4. Conferência ----------------------------------------------------------------------
select
  (select count(*) from information_schema.schemata where schema_name = 'imobinsta') as schema_existe,
  (select c from pg_roles r, unnest(r.rolconfig) c
    where r.rolname = 'authenticator' and c like 'pgrst.db_schemas=%') as schemas_expostos;
