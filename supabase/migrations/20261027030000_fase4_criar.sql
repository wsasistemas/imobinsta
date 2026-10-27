-- imobinsta — Fase 4: criar imagem e carrossel (templates, slides, rascunhos e registro da IA).
-- Aditiva e idempotente. Depende de 20261027020000_fase3_midias.sql.
--
-- O visual de cada template é um componente HTML/React do app (app/src/features/criar/templates).
-- A tabela guarda o catálogo e os campos editáveis; a IA só preenche o JSON desses campos.

-- 1. Templates (catálogo global, só leitura para o app) ------------------------------------
create table if not exists imobinsta.templates (
  id          text primary key,
  nome        text not null,
  formato     text not null default 'retrato' check (formato in ('retrato', 'stories')),
  largura     integer not null default 1080,
  altura      integer not null default 1350,
  cores_json  jsonb not null default '{}'::jsonb,  -- cores padrão (fundo, texto, destaque)
  campos_json jsonb not null default '[]'::jsonb,  -- campos que a IA e o usuário podem editar
  html        text,                                -- reservado: o markup vive no componente do app
  ativo       boolean not null default true,
  ordem       integer not null default 0
);

insert into imobinsta.templates (id, nome, formato, cores_json, campos_json, ordem) values
  ('wsa-neon', 'WSA Neon azul', 'retrato',
   '{"fundo": "#0A1A4F", "texto": "#FFFFFF", "destaque": "#22D3EE"}',
   '["layout", "titulo", "texto", "itens", "cta", "cor_destaque", "posicao"]', 1),
  ('wsa-escuro', 'WSA Escuro', 'retrato',
   '{"fundo": "#0B0B0F", "texto": "#F5F5F7", "destaque": "#FFD60A"}',
   '["layout", "titulo", "texto", "itens", "cta", "cor_destaque", "posicao"]', 2),
  ('wsa-docerias', 'WSA Docerias', 'retrato',
   '{"fundo": "#3B1F14", "texto": "#FFF4EC", "destaque": "#FF8FB1"}',
   '["layout", "titulo", "texto", "itens", "cta", "cor_destaque", "posicao"]', 3)
on conflict (id) do nothing;

-- 2. Rascunhos: campos do briefing no post -----------------------------------------------
alter table imobinsta.posts add column if not exists abordagem   text;
alter table imobinsta.posts add column if not exists origem      text check (origem in ('zero', 'link', 'pauta'));
alter table imobinsta.posts add column if not exists link_url    text;
alter table imobinsta.posts add column if not exists instrucoes  text;
alter table imobinsta.posts add column if not exists prompt      text;
alter table imobinsta.posts add column if not exists template_id text references imobinsta.templates(id);
alter table imobinsta.posts add column if not exists mostrar_logo boolean not null default true;
alter table imobinsta.posts add column if not exists criar_automacao boolean not null default false;

-- O membro cria e edita só rascunhos. Publicar/agendar continua com as Edge Functions (Fase 5).
grant insert (conta_id, formato, objetivo, produto, abordagem, origem, link_url, instrucoes, prompt,
              template_id, mostrar_logo, criar_automacao, legenda, pasta, status)
  on imobinsta.posts to authenticated;
grant update (formato, objetivo, produto, abordagem, origem, link_url, instrucoes, prompt,
              template_id, mostrar_logo, criar_automacao, legenda, pasta, atualizado_em)
  on imobinsta.posts to authenticated;
grant delete on imobinsta.posts to authenticated;

drop policy if exists posts_criar_rascunho on imobinsta.posts;
create policy posts_criar_rascunho on imobinsta.posts for insert to authenticated
  with check (imobinsta.eh_membro(conta_id) and status = 'rascunho' and ig_media_id is null);

drop policy if exists posts_apagar_rascunho on imobinsta.posts;
create policy posts_apagar_rascunho on imobinsta.posts for delete to authenticated
  using (imobinsta.eh_membro(conta_id) and status = 'rascunho' and ig_media_id is null);

-- A policy de update da Fase 3 (pasta) vale para qualquer post. Este gatilho impede que o
-- membro mude o conteúdo de um post que já saiu do rascunho; a pasta continua livre.
create or replace function imobinsta.posts_so_rascunho_editavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and old.status <> 'rascunho' and (
       new.formato, new.objetivo, new.produto, new.abordagem, new.origem, new.link_url, new.instrucoes,
       new.prompt, new.template_id, new.mostrar_logo, new.criar_automacao, new.legenda)
     is distinct from (
       old.formato, old.objetivo, old.produto, old.abordagem, old.origem, old.link_url, old.instrucoes,
       old.prompt, old.template_id, old.mostrar_logo, old.criar_automacao, old.legenda) then
    raise exception 'Só rascunhos podem ser editados (status atual: %)', old.status using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists posts_so_rascunho_editavel on imobinsta.posts;
create trigger posts_so_rascunho_editavel before update on imobinsta.posts
  for each row execute function imobinsta.posts_so_rascunho_editavel();

-- 3. Slides do post ----------------------------------------------------------------------
create table if not exists imobinsta.post_slides (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references imobinsta.posts(id) on delete cascade,
  ordem         integer not null check (ordem between 1 and 10),
  template_id   text not null references imobinsta.templates(id),
  dados_json    jsonb not null default '{}'::jsonb,
  midia_id      uuid references imobinsta.midias(id) on delete set null,  -- PNG final renderizado
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists post_slides_post_idx on imobinsta.post_slides (post_id, ordem);

-- Membro da conta do post. Escrever só enquanto o post é rascunho.
create or replace function imobinsta.post_da_conta(p_post uuid, p_so_rascunho boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from imobinsta.posts p
    where p.id = p_post and imobinsta.eh_membro(p.conta_id) and (not p_so_rascunho or p.status = 'rascunho')
  );
$$;
revoke all on function imobinsta.post_da_conta(uuid, boolean) from public, anon;
grant execute on function imobinsta.post_da_conta(uuid, boolean) to authenticated, service_role;

revoke all on imobinsta.post_slides from anon, public, authenticated;
grant select, insert, update, delete on imobinsta.post_slides to authenticated;
grant all on imobinsta.post_slides to service_role;

alter table imobinsta.post_slides enable row level security;
drop policy if exists post_slides_ler on imobinsta.post_slides;
create policy post_slides_ler on imobinsta.post_slides for select to authenticated
  using (imobinsta.post_da_conta(post_id, false));
drop policy if exists post_slides_incluir on imobinsta.post_slides;
create policy post_slides_incluir on imobinsta.post_slides for insert to authenticated
  with check (imobinsta.post_da_conta(post_id, true));
drop policy if exists post_slides_editar on imobinsta.post_slides;
create policy post_slides_editar on imobinsta.post_slides for update to authenticated
  using (imobinsta.post_da_conta(post_id, true)) with check (imobinsta.post_da_conta(post_id, true));
drop policy if exists post_slides_excluir on imobinsta.post_slides;
create policy post_slides_excluir on imobinsta.post_slides for delete to authenticated
  using (imobinsta.post_da_conta(post_id, true));

-- 4. Registro de cada chamada de IA (só as Edge Functions gravam) ------------------------
create table if not exists imobinsta.geracoes_ia (
  id              uuid primary key default gen_random_uuid(),
  conta_id        uuid not null references imobinsta.contas(id) on delete cascade,
  post_id         uuid references imobinsta.posts(id) on delete set null,
  provedor        text not null check (provedor in ('gemini', 'openai', 'heygen', 'fal')),
  tipo            text not null check (tipo in ('texto', 'imagem', 'video', 'avatar')),
  acao            text,           -- prompt, gerar, editar, legenda...
  modelo          text,
  tokens_entrada  integer,
  tokens_saida    integer,
  custo_usd       numeric(10, 4) not null default 0,
  status          text not null default 'ok' check (status in ('ok', 'erro')),
  erro            text,
  criado_por      uuid references auth.users(id) on delete set null,
  criado_em       timestamptz not null default now()
);
create index if not exists geracoes_ia_conta_idx on imobinsta.geracoes_ia (conta_id, criado_em desc);

revoke all on imobinsta.templates, imobinsta.geracoes_ia from anon, public, authenticated;
grant select on imobinsta.templates, imobinsta.geracoes_ia to authenticated;
grant all on imobinsta.templates, imobinsta.geracoes_ia to service_role;

alter table imobinsta.templates   enable row level security;
alter table imobinsta.geracoes_ia enable row level security;
drop policy if exists templates_ler on imobinsta.templates;
create policy templates_ler on imobinsta.templates for select to authenticated using (ativo);
drop policy if exists geracoes_ia_ler on imobinsta.geracoes_ia;
create policy geracoes_ia_ler on imobinsta.geracoes_ia for select to authenticated using (imobinsta.eh_membro(conta_id));

notify pgrst, 'reload schema';
