-- imobinsta — Fase 2: Instagram oficial (posts, métricas, OAuth e token no Vault).
-- Aditiva e idempotente. Depende de 20261026020000_fase1_contas_membros_conexoes.sql.
-- Quem grava aqui são as Edge Functions ig-oauth e ig-sync (service_role). O front só lê.

-- 1. Posts ------------------------------------------------------------------------------
-- Nesta fase entram só os publicados, vindos do Instagram. Rascunhos e agendados chegam na Fase 4/5.
create table if not exists imobinsta.posts (
  id            uuid primary key default gen_random_uuid(),
  conta_id      uuid not null references imobinsta.contas(id) on delete cascade,
  formato       text not null default 'post' check (formato in ('post', 'carrossel', 'reels', 'stories')),
  objetivo      text,
  produto       text,
  legenda       text,
  status        text not null default 'rascunho'
                check (status in ('rascunho', 'agendado', 'publicando', 'publicado', 'erro')),
  agendado_para timestamptz,
  ig_media_id   text,
  permalink     text,
  capa_url      text,  -- miniatura servida pelo CDN da Meta (expira; o ig-sync renova)
  publicado_em  timestamptz,
  curtidas      integer,
  comentarios   integer,
  erro          text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (conta_id, ig_media_id)
);
create index if not exists posts_conta_publicado_idx on imobinsta.posts (conta_id, publicado_em desc);

-- Um retrato por dia de cada post (o ig-sync roda diário e guarda a evolução).
create table if not exists imobinsta.metricas_post (
  post_id           uuid not null references imobinsta.posts(id) on delete cascade,
  data              date not null,
  alcance           integer,
  views             integer,
  curtidas          integer,
  comentarios       integer,
  salvamentos       integer,
  compartilhamentos integer,
  coletado_em       timestamptz not null default now(),
  primary key (post_id, data)
);

create table if not exists imobinsta.metricas_conta (
  conta_id    uuid not null references imobinsta.contas(id) on delete cascade,
  data        date not null,
  seguidores  integer,
  seguindo    integer,
  total_posts integer,
  alcance     integer,
  coletado_em timestamptz not null default now(),
  primary key (conta_id, data)
);

-- 2. Estado do OAuth (anti-CSRF). Vale 10 minutos e é apagado no retorno. Só service_role.
create table if not exists imobinsta.oauth_estados (
  estado    text primary key,
  conta_id  uuid not null references imobinsta.contas(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  retorno   text not null,  -- origem do app que pediu (preview, produção ou localhost)
  criado_em timestamptz not null default now()
);

-- 3. Token no Vault --------------------------------------------------------------------
-- O token nunca fica em tabela comum: conexoes_segredos guarda só o id do segredo no Vault.
create or replace function imobinsta.salvar_segredo_conexao(p_conexao uuid, p_valor text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id   uuid;
  v_nome text := 'imobinsta_conexao_' || p_conexao::text;
begin
  select s.vault_secret_id into v_id from imobinsta.conexoes_segredos s where s.conexao_id = p_conexao;
  if v_id is null then
    v_id := vault.create_secret(p_valor, v_nome, 'Token de integração do Estúdio imobinsta');
    insert into imobinsta.conexoes_segredos (conexao_id, vault_secret_id) values (p_conexao, v_id);
  else
    perform vault.update_secret(v_id, p_valor);
    update imobinsta.conexoes_segredos set atualizado_em = now() where conexao_id = p_conexao;
  end if;
  return v_id;
end;
$$;

create or replace function imobinsta.ler_segredo_conexao(p_conexao uuid)
returns text language sql stable security definer set search_path = '' as $$
  select d.decrypted_secret
  from imobinsta.conexoes_segredos s
  join vault.decrypted_secrets d on d.id = s.vault_secret_id
  where s.conexao_id = p_conexao;
$$;

revoke all on function imobinsta.salvar_segredo_conexao(uuid, text), imobinsta.ler_segredo_conexao(uuid)
  from public, anon, authenticated;
grant execute on function imobinsta.salvar_segredo_conexao(uuid, text), imobinsta.ler_segredo_conexao(uuid)
  to service_role;

-- 4. Grants ----------------------------------------------------------------------------
revoke all on imobinsta.posts, imobinsta.metricas_post, imobinsta.metricas_conta, imobinsta.oauth_estados
  from anon, public, authenticated;
grant select on imobinsta.posts, imobinsta.metricas_post, imobinsta.metricas_conta to authenticated;
grant all on imobinsta.posts, imobinsta.metricas_post, imobinsta.metricas_conta, imobinsta.oauth_estados to service_role;

-- 5. RLS -------------------------------------------------------------------------------
alter table imobinsta.posts          enable row level security;
alter table imobinsta.metricas_post  enable row level security;
alter table imobinsta.metricas_conta enable row level security;
alter table imobinsta.oauth_estados  enable row level security;  -- sem policy: só service_role

drop policy if exists posts_ler on imobinsta.posts;
create policy posts_ler on imobinsta.posts for select to authenticated using (imobinsta.eh_membro(conta_id));

drop policy if exists metricas_post_ler on imobinsta.metricas_post;
create policy metricas_post_ler on imobinsta.metricas_post for select to authenticated
  using (exists (select 1 from imobinsta.posts p where p.id = post_id and imobinsta.eh_membro(p.conta_id)));

drop policy if exists metricas_conta_ler on imobinsta.metricas_conta;
create policy metricas_conta_ler on imobinsta.metricas_conta for select to authenticated
  using (imobinsta.eh_membro(conta_id));

notify pgrst, 'reload schema';
