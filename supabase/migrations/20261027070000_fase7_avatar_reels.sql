-- imobinsta — Fase 7 (etapa 7.2): avatares, roteiros de vídeo com avatar e publicação de Reels.
-- Aditiva e idempotente. Depende de 20261027040000_fase5_publicar.sql e 20261027060000_fase7_ia_paga.sql.
--
-- O avatar é treinado no provedor (HeyGen); aqui fica só o cadastro (ids externos) e o registro do
-- consentimento de uso da imagem e da voz. O vídeo gerado vai para o banco de mídias e vira Reels.

-- 1. Avatares -----------------------------------------------------------------------------
create table if not exists imobinsta.avatares (
  id                  uuid primary key default gen_random_uuid(),
  conta_id            uuid not null references imobinsta.contas(id) on delete cascade,
  nome                text not null check (char_length(btrim(nome)) between 1 and 80),
  provedor            text not null default 'heygen' check (provedor in ('heygen')),
  avatar_externo_id   text not null check (char_length(avatar_externo_id) <= 200),
  voz_externa_id      text not null check (char_length(voz_externa_id) <= 200),
  preview_url         text check (preview_url is null or char_length(preview_url) <= 1000),
  consentimento_texto text not null check (char_length(btrim(consentimento_texto)) between 20 and 2000),
  consentimento_em    timestamptz not null default now(),
  consentimento_por   uuid default auth.uid() references auth.users(id) on delete set null,
  ativo               boolean not null default true,
  criado_em           timestamptz not null default now(),
  unique (conta_id, provedor, avatar_externo_id)
);

revoke all on imobinsta.avatares from anon, public, authenticated;
grant select, delete on imobinsta.avatares to authenticated;
grant insert (conta_id, nome, provedor, avatar_externo_id, voz_externa_id, preview_url, consentimento_texto) on imobinsta.avatares to authenticated;
grant update (nome, voz_externa_id, ativo) on imobinsta.avatares to authenticated;
grant all on imobinsta.avatares to service_role;

alter table imobinsta.avatares enable row level security;
drop policy if exists avatares_ler on imobinsta.avatares;
create policy avatares_ler on imobinsta.avatares for select to authenticated using (imobinsta.eh_membro(conta_id));
-- Só o dono cadastra, porque é ele quem declara o consentimento da pessoa do avatar.
drop policy if exists avatares_incluir on imobinsta.avatares;
create policy avatares_incluir on imobinsta.avatares for insert to authenticated with check (imobinsta.eh_dono(conta_id));
drop policy if exists avatares_editar on imobinsta.avatares;
create policy avatares_editar on imobinsta.avatares for update to authenticated
  using (imobinsta.eh_dono(conta_id)) with check (imobinsta.eh_dono(conta_id));
drop policy if exists avatares_excluir on imobinsta.avatares;
create policy avatares_excluir on imobinsta.avatares for delete to authenticated using (imobinsta.eh_dono(conta_id));

-- 2. Roteiros (vídeo com avatar) ------------------------------------------------------------
create table if not exists imobinsta.roteiros (
  id              uuid primary key default gen_random_uuid(),
  conta_id        uuid not null references imobinsta.contas(id) on delete cascade,
  avatar_id       uuid references imobinsta.avatares(id) on delete set null,
  titulo          text not null check (char_length(btrim(titulo)) between 1 and 160),
  produto         text check (produto is null or char_length(produto) <= 100),
  texto           text not null check (char_length(btrim(texto)) between 20 and 3000),
  legenda         text check (legenda is null or char_length(legenda) <= 2200),
  status          text not null default 'rascunho' check (status in ('rascunho', 'gerando', 'pronto', 'erro')),
  video_externo_id text,
  midia_id        uuid references imobinsta.midias(id) on delete set null,
  post_id         uuid references imobinsta.posts(id) on delete set null,
  custo_usd       numeric(10, 4),
  erro            text,
  criado_por      uuid default auth.uid() references auth.users(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists roteiros_conta_idx on imobinsta.roteiros (conta_id, criado_em desc);

-- O membro escreve o roteiro enquanto é rascunho (ou erro); gerar, status e vídeo são da Edge Function.
create or replace function imobinsta.roteiros_so_rascunho()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and old.status not in ('rascunho', 'erro')
     and (new.titulo, new.produto, new.texto, new.avatar_id) is distinct from (old.titulo, old.produto, old.texto, old.avatar_id) then
    raise exception 'Roteiro em geração ou pronto não pode ser editado (status: %)', old.status using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists roteiros_so_rascunho on imobinsta.roteiros;
create trigger roteiros_so_rascunho before update on imobinsta.roteiros
  for each row execute function imobinsta.roteiros_so_rascunho();

-- O avatar e o post ligados precisam ser da mesma conta.
create or replace function imobinsta.roteiro_refs_ok(p_conta uuid, p_avatar uuid, p_post uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (p_avatar is null or exists (select 1 from imobinsta.avatares a where a.id = p_avatar and a.conta_id = p_conta))
     and (p_post is null or exists (select 1 from imobinsta.posts p where p.id = p_post and p.conta_id = p_conta));
$$;
revoke all on function imobinsta.roteiro_refs_ok(uuid, uuid, uuid) from public, anon;
grant execute on function imobinsta.roteiro_refs_ok(uuid, uuid, uuid) to authenticated, service_role;

revoke all on imobinsta.roteiros from anon, public, authenticated;
grant select on imobinsta.roteiros to authenticated;
grant insert (conta_id, avatar_id, titulo, produto, texto, legenda) on imobinsta.roteiros to authenticated;
grant update (avatar_id, titulo, produto, texto, legenda, post_id) on imobinsta.roteiros to authenticated;
grant all on imobinsta.roteiros to service_role;

alter table imobinsta.roteiros enable row level security;
drop policy if exists roteiros_ler on imobinsta.roteiros;
create policy roteiros_ler on imobinsta.roteiros for select to authenticated using (imobinsta.eh_membro(conta_id));
drop policy if exists roteiros_incluir on imobinsta.roteiros;
create policy roteiros_incluir on imobinsta.roteiros for insert to authenticated
  with check (imobinsta.eh_membro(conta_id) and imobinsta.roteiro_refs_ok(conta_id, avatar_id, null));
drop policy if exists roteiros_editar on imobinsta.roteiros;
create policy roteiros_editar on imobinsta.roteiros for update to authenticated
  using (imobinsta.eh_membro(conta_id))
  with check (imobinsta.eh_membro(conta_id) and imobinsta.roteiro_refs_ok(conta_id, avatar_id, post_id));

-- 3. Reels: o post aponta para o vídeo do banco de mídias -------------------------------------
alter table imobinsta.posts add column if not exists video_midia_id uuid references imobinsta.midias(id) on delete set null;
alter table imobinsta.posts add column if not exists ig_container_id text;  -- container de vídeo em processamento na Meta
grant insert (video_midia_id) on imobinsta.posts to authenticated;
grant update (video_midia_id) on imobinsta.posts to authenticated;

-- O vídeo ligado precisa ser da mesma conta do post.
create or replace function imobinsta.post_video_ok(p_conta uuid, p_midia uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_midia is null or exists (select 1 from imobinsta.midias m where m.id = p_midia and m.conta_id = p_conta and m.tipo = 'video');
$$;
revoke all on function imobinsta.post_video_ok(uuid, uuid) from public, anon;
grant execute on function imobinsta.post_video_ok(uuid, uuid) to authenticated, service_role;

-- O gatilho das Fases 4/5 passa a proteger também o vídeo fora do rascunho e a conferir a conta do vídeo.
create or replace function imobinsta.posts_so_rascunho_editavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and old.status <> 'rascunho' and (
       new.formato, new.objetivo, new.produto, new.abordagem, new.origem, new.link_url, new.instrucoes,
       new.prompt, new.template_id, new.mostrar_logo, new.criar_automacao, new.legenda, new.automacao_json, new.video_midia_id)
     is distinct from (
       old.formato, old.objetivo, old.produto, old.abordagem, old.origem, old.link_url, old.instrucoes,
       old.prompt, old.template_id, old.mostrar_logo, old.criar_automacao, old.legenda, old.automacao_json, old.video_midia_id) then
    raise exception 'Só rascunhos podem ser editados (status atual: %)', old.status using errcode = '42501';
  end if;
  if current_user = 'authenticated' and new.video_midia_id is distinct from old.video_midia_id
     and not imobinsta.post_video_ok(new.conta_id, new.video_midia_id) then
    raise exception 'O vídeo precisa ser da mesma conta' using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

drop policy if exists posts_criar_rascunho on imobinsta.posts;
create policy posts_criar_rascunho on imobinsta.posts for insert to authenticated
  with check (imobinsta.eh_membro(conta_id) and status = 'rascunho' and ig_media_id is null
              and imobinsta.post_video_ok(conta_id, video_midia_id));

-- 4. Fila: o tick também termina Reels cujo vídeo ainda processava na Meta ----------------------
create or replace function imobinsta.publicar_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_segredo text;
begin
  -- Publicação que travou: imagem em 15 min; Reels (container de vídeo) em 40 min.
  update imobinsta.posts
     set status = 'erro', erro = 'A publicação foi interrompida. Confira no Instagram se o post saiu antes de tentar de novo.'
   where status = 'publicando'
     and atualizado_em < now() - case when ig_container_id is null then interval '15 minutes' else interval '40 minutes' end;

  if not exists (
    select 1 from imobinsta.posts
    where (status = 'agendado' and agendado_para <= now()) or (status = 'publicando' and ig_container_id is not null)
  ) then
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

notify pgrst, 'reload schema';
