-- imobinsta — Fase 3: banco de mídias (Storage + tabela midias) e pastas na Biblioteca.
-- Aditiva e idempotente. Depende de 20261026030000_fase2_instagram.sql.
--
-- Dois buckets (um bucket do Supabase é inteiro público ou inteiro privado):
--   imobinsta-midias      PRIVADO  · caminho <conta_id>/<arquivo> · membros da conta leem e gravam
--   imobinsta-publicados  PÚBLICO  · só as Edge Functions gravam (Fase 5: a Meta baixa a mídia por URL pública)

-- 1. Buckets ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('imobinsta-midias', 'imobinsta-midias', false, 104857600,
   array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
         'video/mp4', 'video/quicktime', 'video/webm',
         'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg']),
  ('imobinsta-publicados', 'imobinsta-publicados', true, 104857600,
   array['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

-- conta_id = primeira pasta do caminho. Caminho fora do padrão → null (a policy nega).
create or replace function imobinsta.conta_do_caminho(p_nome text)
returns uuid language sql immutable set search_path = '' as $$
  select case when split_part(p_nome, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_nome, '/', 1)::uuid end;
$$;
grant execute on function imobinsta.conta_do_caminho(text) to authenticated, service_role;

-- 2. Policies do Storage (só o bucket privado; o público não tem policy para authenticated) ----
drop policy if exists imobinsta_midias_ler on storage.objects;
create policy imobinsta_midias_ler on storage.objects for select to authenticated
  using (bucket_id = 'imobinsta-midias' and imobinsta.eh_membro(imobinsta.conta_do_caminho(name)));

drop policy if exists imobinsta_midias_enviar on storage.objects;
create policy imobinsta_midias_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'imobinsta-midias' and imobinsta.eh_membro(imobinsta.conta_do_caminho(name)));

drop policy if exists imobinsta_midias_alterar on storage.objects;
create policy imobinsta_midias_alterar on storage.objects for update to authenticated
  using (bucket_id = 'imobinsta-midias' and imobinsta.eh_membro(imobinsta.conta_do_caminho(name)))
  with check (bucket_id = 'imobinsta-midias' and imobinsta.eh_membro(imobinsta.conta_do_caminho(name)));

drop policy if exists imobinsta_midias_apagar on storage.objects;
create policy imobinsta_midias_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'imobinsta-midias' and imobinsta.eh_membro(imobinsta.conta_do_caminho(name)));

-- 3. Tabela midias ---------------------------------------------------------------------
create table if not exists imobinsta.midias (
  id            uuid primary key default gen_random_uuid(),
  conta_id      uuid not null references imobinsta.contas(id) on delete cascade,
  pasta         text not null default 'Geral',
  tipo          text not null check (tipo in ('imagem', 'video', 'logo', 'trilha', 'print')),
  nome          text not null,
  storage_path  text not null unique,
  mime          text,
  tamanho_bytes bigint,
  largura       integer,
  altura        integer,
  duracao_s     numeric(8, 2),
  origem        text not null default 'upload' check (origem in ('upload', 'ia', 'render')),
  criado_por    uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em     timestamptz not null default now(),
  -- o arquivo precisa estar na pasta da própria conta
  check (split_part(storage_path, '/', 1) = conta_id::text)
);
create index if not exists midias_conta_idx on imobinsta.midias (conta_id, criado_em desc);

revoke all on imobinsta.midias from anon, public, authenticated;
grant select, insert, update, delete on imobinsta.midias to authenticated;
grant all on imobinsta.midias to service_role;

alter table imobinsta.midias enable row level security;
drop policy if exists midias_ler on imobinsta.midias;
create policy midias_ler on imobinsta.midias for select to authenticated using (imobinsta.eh_membro(conta_id));
drop policy if exists midias_incluir on imobinsta.midias;
create policy midias_incluir on imobinsta.midias for insert to authenticated with check (imobinsta.eh_membro(conta_id));
drop policy if exists midias_editar on imobinsta.midias;
create policy midias_editar on imobinsta.midias for update to authenticated
  using (imobinsta.eh_membro(conta_id)) with check (imobinsta.eh_membro(conta_id));
drop policy if exists midias_excluir on imobinsta.midias;
create policy midias_excluir on imobinsta.midias for delete to authenticated using (imobinsta.eh_membro(conta_id));

-- 4. Pastas na Biblioteca: o membro só pode mudar a pasta do post (o resto é das Edge Functions)
alter table imobinsta.posts add column if not exists pasta text;
grant update (pasta) on imobinsta.posts to authenticated;
drop policy if exists posts_mudar_pasta on imobinsta.posts;
create policy posts_mudar_pasta on imobinsta.posts for update to authenticated
  using (imobinsta.eh_membro(conta_id)) with check (imobinsta.eh_membro(conta_id));

notify pgrst, 'reload schema';
