-- imobinsta — Fase 10: DNA da marca (como o Pomelli, feito no estúdio com o Gemini) e campanhas sugeridas.
-- Aditiva e idempotente. Depende de 20261027050000_fase6_pautas.sql.
--
-- O DNA é lido do site pela Edge Function ia-texto (ação "dna") e guia toda geração de texto.
-- Campanhas sugeridas pela IA viram pautas no Calendário quando aprovadas (ação "aprovar_campanha").

-- 1. DNA da marca (uma linha por conta) -----------------------------------------------------
create table if not exists imobinsta.marca_dna (
  conta_id   uuid primary key references imobinsta.contas(id) on delete cascade,
  site_url   text check (site_url is null or char_length(site_url) <= 500),
  cores      jsonb not null default '[]'::jsonb,   -- ["#0A4FD6", ...] (a primeira é a principal)
  fontes     jsonb not null default '{}'::jsonb,   -- {"titulo": "...", "texto": "..."}
  imagens    jsonb not null default '[]'::jsonb,   -- [{"midia_id", "storage_path", "origem"}]
  tom        jsonb not null default '{}'::jsonb,   -- {"adjetivos": [], "descricao": "", "exemplos": []}
  publico    text check (publico is null or char_length(publico) <= 500),
  proposta   text check (proposta is null or char_length(proposta) <= 500),
  pilares    jsonb not null default '[]'::jsonb,
  usar       jsonb not null default '[]'::jsonb,
  evitar     jsonb not null default '[]'::jsonb,
  lido_em    timestamptz,
  editado_em timestamptz not null default now()
);

revoke all on imobinsta.marca_dna from anon, public, authenticated;
grant select on imobinsta.marca_dna to authenticated;
grant insert (conta_id, site_url, cores, fontes, tom, publico, proposta, pilares, usar, evitar) on imobinsta.marca_dna to authenticated;
grant update (site_url, cores, fontes, tom, publico, proposta, pilares, usar, evitar, editado_em) on imobinsta.marca_dna to authenticated;
grant all on imobinsta.marca_dna to service_role;

alter table imobinsta.marca_dna enable row level security;
drop policy if exists marca_dna_ler on imobinsta.marca_dna;
create policy marca_dna_ler on imobinsta.marca_dna for select to authenticated using (imobinsta.eh_membro(conta_id));
drop policy if exists marca_dna_incluir on imobinsta.marca_dna;
create policy marca_dna_incluir on imobinsta.marca_dna for insert to authenticated with check (imobinsta.eh_dono(conta_id));
drop policy if exists marca_dna_editar on imobinsta.marca_dna;
create policy marca_dna_editar on imobinsta.marca_dna for update to authenticated
  using (imobinsta.eh_dono(conta_id)) with check (imobinsta.eh_dono(conta_id));

-- 2. Campanhas ----------------------------------------------------------------------------------
create table if not exists imobinsta.campanhas (
  id         uuid primary key default gen_random_uuid(),
  conta_id   uuid not null references imobinsta.contas(id) on delete cascade,
  nome       text not null check (char_length(btrim(nome)) between 1 and 120),
  objetivo   text not null default 'vender' check (objetivo in ('engajar', 'seguidores', 'vender')),
  publico    text check (publico is null or char_length(publico) <= 300),
  descricao  text check (descricao is null or char_length(descricao) <= 1000),
  semanas    integer not null default 4 check (semanas between 1 and 8),
  posts_json jsonb not null default '[]'::jsonb,  -- sugestões da IA: [{titulo, formato, produto, notas}]
  status     text not null default 'sugerida' check (status in ('sugerida', 'aprovada', 'descartada')),
  origem     text not null default 'ia' check (origem in ('ia', 'manual')),
  inicio     date,
  fim        date,
  criado_em  timestamptz not null default now()
);
create index if not exists campanhas_conta_idx on imobinsta.campanhas (conta_id, criado_em desc);

-- Aprovar (status aprovada + pautas) é da Edge Function; o membro descarta, renomeia ou apaga.
revoke all on imobinsta.campanhas from anon, public, authenticated;
grant select, delete on imobinsta.campanhas to authenticated;
grant update (nome, descricao, status) on imobinsta.campanhas to authenticated;
grant all on imobinsta.campanhas to service_role;

alter table imobinsta.campanhas enable row level security;
drop policy if exists campanhas_ler on imobinsta.campanhas;
create policy campanhas_ler on imobinsta.campanhas for select to authenticated using (imobinsta.eh_membro(conta_id));
drop policy if exists campanhas_editar on imobinsta.campanhas;
create policy campanhas_editar on imobinsta.campanhas for update to authenticated
  using (imobinsta.eh_membro(conta_id)) with check (imobinsta.eh_membro(conta_id) and status in ('sugerida', 'descartada'));
drop policy if exists campanhas_excluir on imobinsta.campanhas;
create policy campanhas_excluir on imobinsta.campanhas for delete to authenticated using (imobinsta.eh_membro(conta_id));

-- 3. Pauta ligada à campanha ----------------------------------------------------------------------
alter table imobinsta.pautas add column if not exists campanha_id uuid references imobinsta.campanhas(id) on delete set null;
create index if not exists pautas_campanha_idx on imobinsta.pautas (campanha_id) where campanha_id is not null;

-- 4. Template "Marca": usa as cores do DNA (o app lê marca_dna); aqui só o catálogo ------------------
insert into imobinsta.templates (id, nome, formato, cores_json, campos_json, ordem) values
  ('marca', 'Marca (DNA)', 'retrato',
   '{"fundo": "#0B1220", "texto": "#FFFFFF", "destaque": "#0A4FD6"}',
   '["layout", "titulo", "texto", "itens", "cta", "cor_destaque", "posicao"]', 4)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
