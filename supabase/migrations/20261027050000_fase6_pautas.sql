-- imobinsta — Fase 6: pautas do calendário editorial.
-- Aditiva e idempotente. Depende de 20261027030000_fase4_criar.sql (posts) e da Fase 1 (eh_membro).
--
-- Pauta é a ideia marcada num dia. Ela vira post pelo wizard (post_id). Origem 'ia' = sugerida
-- pelas Recomendações IA (Etapa 6.2); o membro pode editar ou apagar como qualquer outra.

create table if not exists imobinsta.pautas (
  id            uuid primary key default gen_random_uuid(),
  conta_id      uuid not null references imobinsta.contas(id) on delete cascade,
  data          date not null,
  titulo        text not null check (char_length(btrim(titulo)) between 1 and 200),
  produto       text check (produto is null or char_length(produto) <= 100),
  formato       text not null default 'carrossel' check (formato in ('post', 'carrossel', 'reels')),
  origem        text not null default 'manual' check (origem in ('manual', 'ia')),
  notas         text check (notas is null or char_length(notas) <= 2000),
  post_id       uuid references imobinsta.posts(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists pautas_conta_data_idx on imobinsta.pautas (conta_id, data);

create or replace function imobinsta.pautas_atualizado()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists pautas_atualizado on imobinsta.pautas;
create trigger pautas_atualizado before update on imobinsta.pautas
  for each row execute function imobinsta.pautas_atualizado();

-- O post ligado precisa ser da mesma conta da pauta.
create or replace function imobinsta.pauta_post_ok(p_conta uuid, p_post uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_post is null or exists (select 1 from imobinsta.posts p where p.id = p_post and p.conta_id = p_conta);
$$;
revoke all on function imobinsta.pauta_post_ok(uuid, uuid) from public, anon;
grant execute on function imobinsta.pauta_post_ok(uuid, uuid) to authenticated, service_role;

revoke all on imobinsta.pautas from anon, public, authenticated;
grant select, delete on imobinsta.pautas to authenticated;
grant insert (conta_id, data, titulo, produto, formato, origem, notas, post_id) on imobinsta.pautas to authenticated;
grant update (data, titulo, produto, formato, notas, post_id) on imobinsta.pautas to authenticated;
grant all on imobinsta.pautas to service_role;

alter table imobinsta.pautas enable row level security;
drop policy if exists pautas_ler on imobinsta.pautas;
create policy pautas_ler on imobinsta.pautas for select to authenticated
  using (imobinsta.eh_membro(conta_id));
drop policy if exists pautas_incluir on imobinsta.pautas;
create policy pautas_incluir on imobinsta.pautas for insert to authenticated
  with check (imobinsta.eh_membro(conta_id) and imobinsta.pauta_post_ok(conta_id, post_id));
drop policy if exists pautas_editar on imobinsta.pautas;
create policy pautas_editar on imobinsta.pautas for update to authenticated
  using (imobinsta.eh_membro(conta_id))
  with check (imobinsta.eh_membro(conta_id) and imobinsta.pauta_post_ok(conta_id, post_id));
drop policy if exists pautas_excluir on imobinsta.pautas;
create policy pautas_excluir on imobinsta.pautas for delete to authenticated
  using (imobinsta.eh_membro(conta_id));

notify pgrst, 'reload schema';
