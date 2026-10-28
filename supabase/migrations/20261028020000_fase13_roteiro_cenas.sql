-- imobinsta — Fase 13: vídeo explicativo com avatar + telas do sistema (roteiro em cenas).
-- Aditiva e idempotente. Depende de 20261027070000_fase7_avatar_reels.sql e 20261027100000_fase11_vids.sql.
--
-- Cada cena tem a fala, o layout (apresentador, canto, bolha, tela dividida), o fundo (print ou vídeo do
-- sistema no Banco de mídias) e a montagem (posição, tamanho, forma do avatar). Na 13.2, a Edge Function
-- ia-avatar gera um vídeo do avatar por cena e grava status, vídeo e legenda (SRT) da cena.

-- 1. Roteiro: tipo e montagem do vídeo inteiro ------------------------------------------------------------
alter table imobinsta.roteiros add column if not exists tipo text not null default 'simples'
  check (tipo in ('simples', 'cenas'));
alter table imobinsta.roteiros add column if not exists objetivo text
  check (objetivo is null or objetivo in ('engajar', 'vender', 'ensinar'));
-- {formato: "9:16"|"4:5"|"1:1"|"16:9", legenda: "palavra"|"frase"|"sem", logo, trilha, ...} (montagem no navegador)
alter table imobinsta.roteiros add column if not exists projeto_json jsonb not null default '{}'::jsonb;
grant insert (tipo, objetivo, projeto_json) on imobinsta.roteiros to authenticated;
grant update (objetivo, projeto_json) on imobinsta.roteiros to authenticated;

-- 2. Cenas -------------------------------------------------------------------------------------------------
create table if not exists imobinsta.roteiro_cenas (
  id               uuid primary key default gen_random_uuid(),
  roteiro_id       uuid not null references imobinsta.roteiros(id) on delete cascade,
  conta_id         uuid not null references imobinsta.contas(id) on delete cascade,
  ordem            integer not null check (ordem between 1 and 20),
  fala             text not null check (char_length(btrim(fala)) between 1 and 600),
  layout           text not null default 'apresentador' check (layout in ('apresentador', 'canto', 'bolha', 'dividida')),
  fundo_midia_id   uuid references imobinsta.midias(id) on delete set null,
  look_id          text check (look_id is null or char_length(look_id) <= 200), -- outro look só nesta cena (opcional)
  montagem         jsonb not null default '{}'::jsonb,                          -- {x, y, tamanho, forma}
  -- Preenchidos pela Edge Function (13.2):
  status           text not null default 'rascunho' check (status in ('rascunho', 'gerando', 'pronto', 'erro')),
  video_externo_id text,
  avatar_midia_id  uuid references imobinsta.midias(id) on delete set null,
  srt              text check (srt is null or char_length(srt) <= 20000),
  fala_gerada      text,                                                        -- a fala do vídeo pronto (mudou → gera de novo)
  custo_usd        numeric(10, 4),
  erro             text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists roteiro_cenas_roteiro_idx on imobinsta.roteiro_cenas (roteiro_id, ordem);

-- A cena precisa ser da mesma conta do roteiro, e o fundo também.
create or replace function imobinsta.cena_refs_ok(p_conta uuid, p_roteiro uuid, p_fundo uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from imobinsta.roteiros r where r.id = p_roteiro and r.conta_id = p_conta)
     and (p_fundo is null or exists (select 1 from imobinsta.midias m where m.id = p_fundo and m.conta_id = p_conta));
$$;
revoke all on function imobinsta.cena_refs_ok(uuid, uuid, uuid) from public, anon;
grant execute on function imobinsta.cena_refs_ok(uuid, uuid, uuid) to authenticated, service_role;

-- Cena em geração não muda de fala nem de look; o resto (layout, fundo, montagem, ordem) é livre: é só montagem.
create or replace function imobinsta.roteiro_cenas_guarda()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and old.status = 'gerando'
     and (new.fala, new.look_id) is distinct from (old.fala, old.look_id) then
    raise exception 'A cena está sendo gerada na HeyGen; espere terminar para mudar a fala.' using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists roteiro_cenas_guarda on imobinsta.roteiro_cenas;
create trigger roteiro_cenas_guarda before update on imobinsta.roteiro_cenas
  for each row execute function imobinsta.roteiro_cenas_guarda();

revoke all on imobinsta.roteiro_cenas from anon, public, authenticated;
grant select, delete on imobinsta.roteiro_cenas to authenticated;
grant insert (roteiro_id, conta_id, ordem, fala, layout, fundo_midia_id, look_id, montagem) on imobinsta.roteiro_cenas to authenticated;
grant update (ordem, fala, layout, fundo_midia_id, look_id, montagem) on imobinsta.roteiro_cenas to authenticated;
grant all on imobinsta.roteiro_cenas to service_role;

alter table imobinsta.roteiro_cenas enable row level security;
drop policy if exists roteiro_cenas_ler on imobinsta.roteiro_cenas;
create policy roteiro_cenas_ler on imobinsta.roteiro_cenas for select to authenticated using (imobinsta.eh_membro(conta_id));
drop policy if exists roteiro_cenas_incluir on imobinsta.roteiro_cenas;
create policy roteiro_cenas_incluir on imobinsta.roteiro_cenas for insert to authenticated
  with check (imobinsta.eh_membro(conta_id) and imobinsta.cena_refs_ok(conta_id, roteiro_id, fundo_midia_id));
drop policy if exists roteiro_cenas_editar on imobinsta.roteiro_cenas;
create policy roteiro_cenas_editar on imobinsta.roteiro_cenas for update to authenticated
  using (imobinsta.eh_membro(conta_id))
  with check (imobinsta.eh_membro(conta_id) and imobinsta.cena_refs_ok(conta_id, roteiro_id, fundo_midia_id));
drop policy if exists roteiro_cenas_excluir on imobinsta.roteiro_cenas;
create policy roteiro_cenas_excluir on imobinsta.roteiro_cenas for delete to authenticated
  using (imobinsta.eh_membro(conta_id) and status <> 'gerando');
