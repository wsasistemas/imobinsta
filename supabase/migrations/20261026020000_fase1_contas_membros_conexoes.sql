-- imobinsta — Fase 1: contas, membros e conexões, com RLS por conta_id.
-- Aditiva e idempotente. Depende de 20261026010000_criar_schema_imobinsta.sql.
-- Login único do ikvj (auth.users compartilhado): só entra no estúdio quem tem linha em imobinsta.membros.

-- 1. Tabelas --------------------------------------------------------------------------
create table if not exists imobinsta.contas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  ig_user_id    text,
  ig_username   text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists imobinsta.membros (
  conta_id  uuid not null references imobinsta.contas(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  papel     text not null default 'editor' check (papel in ('dono', 'editor')),
  ativo     boolean not null default true,
  criado_em timestamptz not null default now(),
  primary key (conta_id, user_id)
);
create index if not exists membros_user_idx on imobinsta.membros (user_id) where ativo;

-- Status das integrações. NUNCA guarda chave/token: isso fica no Vault (tabela abaixo).
create table if not exists imobinsta.conexoes (
  id            uuid primary key default gen_random_uuid(),
  conta_id      uuid not null references imobinsta.contas(id) on delete cascade,
  provedor      text not null check (provedor in ('instagram', 'chatfyre', 'gemini', 'openai', 'heygen', 'fal')),
  status        text not null default 'a_conectar' check (status in ('a_conectar', 'conectado', 'expirado', 'erro')),
  detalhe       text,
  expira_em     timestamptz,
  atualizado_em timestamptz not null default now(),
  unique (conta_id, provedor)
);

-- Referência ao segredo no Vault. Só o service_role (Edge Functions) enxerga.
create table if not exists imobinsta.conexoes_segredos (
  conexao_id      uuid primary key references imobinsta.conexoes(id) on delete cascade,
  vault_secret_id uuid not null,
  atualizado_em   timestamptz not null default now()
);

-- 2. Funções de acesso (security definer: evitam recursão nas policies) ----------------
create or replace function imobinsta.eh_membro(p_conta uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from imobinsta.membros m
    where m.conta_id = p_conta and m.user_id = auth.uid() and m.ativo
  );
$$;

create or replace function imobinsta.eh_dono(p_conta uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from imobinsta.membros m
    where m.conta_id = p_conta and m.user_id = auth.uid() and m.ativo and m.papel = 'dono'
  );
$$;

-- Contas do usuário logado (o app usa para liberar ou barrar a entrada).
create or replace function imobinsta.minhas_contas()
returns table (conta_id uuid, nome text, ig_username text, papel text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.nome, c.ig_username, m.papel
  from imobinsta.membros m
  join imobinsta.contas c on c.id = m.conta_id
  where m.user_id = auth.uid() and m.ativo
  order by c.nome;
$$;

revoke all on function imobinsta.eh_membro(uuid), imobinsta.eh_dono(uuid), imobinsta.minhas_contas() from public, anon;
grant execute on function imobinsta.eh_membro(uuid), imobinsta.eh_dono(uuid), imobinsta.minhas_contas() to authenticated, service_role;

-- 3. Grants explícitos (além dos default privileges do schema) -------------------------
-- Os default privileges dão CRUD ao authenticated; aqui cada tabela fica só com o que precisa.
revoke all on imobinsta.contas, imobinsta.membros, imobinsta.conexoes, imobinsta.conexoes_segredos from anon, public, authenticated;
grant select, update on imobinsta.contas to authenticated;
grant select, insert, update, delete on imobinsta.membros to authenticated;
grant select on imobinsta.conexoes to authenticated;  -- quem grava status são as Edge Functions (service_role)
grant all on imobinsta.contas, imobinsta.membros, imobinsta.conexoes, imobinsta.conexoes_segredos to service_role;

-- 4. RLS -------------------------------------------------------------------------------
alter table imobinsta.contas            enable row level security;
alter table imobinsta.membros           enable row level security;
alter table imobinsta.conexoes          enable row level security;
alter table imobinsta.conexoes_segredos enable row level security;  -- sem policy: ninguém além do service_role

drop policy if exists contas_ler on imobinsta.contas;
create policy contas_ler on imobinsta.contas for select to authenticated using (imobinsta.eh_membro(id));
drop policy if exists contas_editar on imobinsta.contas;
create policy contas_editar on imobinsta.contas for update to authenticated
  using (imobinsta.eh_dono(id)) with check (imobinsta.eh_dono(id));

drop policy if exists membros_ler on imobinsta.membros;
create policy membros_ler on imobinsta.membros for select to authenticated using (imobinsta.eh_membro(conta_id));
drop policy if exists membros_incluir on imobinsta.membros;
create policy membros_incluir on imobinsta.membros for insert to authenticated with check (imobinsta.eh_dono(conta_id));
drop policy if exists membros_editar on imobinsta.membros;
create policy membros_editar on imobinsta.membros for update to authenticated
  using (imobinsta.eh_dono(conta_id)) with check (imobinsta.eh_dono(conta_id));
drop policy if exists membros_excluir on imobinsta.membros;
create policy membros_excluir on imobinsta.membros for delete to authenticated
  using (imobinsta.eh_dono(conta_id) and user_id <> auth.uid());  -- o dono não se remove sozinho

drop policy if exists conexoes_ler on imobinsta.conexoes;
create policy conexoes_ler on imobinsta.conexoes for select to authenticated using (imobinsta.eh_membro(conta_id));

-- 5. Conta da WSA e status atual das conexões (dados reais de 25/10/2026) -------------
insert into imobinsta.contas (id, nome, ig_user_id, ig_username)
values ('00000000-0000-4000-a000-000000000001', 'WSA Sistemas de IA', '17841419660248771', 'wsasistemas.ia')
on conflict (id) do nothing;

insert into imobinsta.conexoes (conta_id, provedor, status, detalhe, expira_em) values
  ('00000000-0000-4000-a000-000000000001', 'instagram', 'a_conectar', 'API oficial da Meta: publicar, agendar e métricas (Fase 2)', null),
  ('00000000-0000-4000-a000-000000000001', 'chatfyre',  'conectado',  'Automações comentário → DM · @wsasistemas.ia', '2026-12-24 23:29:00-03'),
  ('00000000-0000-4000-a000-000000000001', 'gemini',    'a_conectar', 'Legendas, prompts e edição por chat (Fase 4)', null),
  ('00000000-0000-4000-a000-000000000001', 'openai',    'a_conectar', 'Imagens por IA (Fase 7) · pago por uso', null),
  ('00000000-0000-4000-a000-000000000001', 'heygen',    'a_conectar', 'Vídeo com avatar (Fase 7) · pago por uso', null),
  ('00000000-0000-4000-a000-000000000001', 'fal',       'a_conectar', 'Alternativa “tudo em um” (Fase 7) · pago por uso', null)
on conflict (conta_id, provedor) do nothing;

notify pgrst, 'reload schema';
