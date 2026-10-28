-- imobinsta — Fase 9: Radar de prospecção (busca oficial por hashtag + IA sugere o comentário).
-- Aditiva e idempotente. Depende de 20261027010000_fase2_sync_diario.sql (segredo do pg_cron e pg_net).
--
-- Nada é enviado sozinho: a IA sugere o comentário e o membro publica à mão, no Instagram.
-- Limite de ritmo humano no servidor (radar_contato): até 20 contatos por dia e 3 min entre eles.
-- LGPD (decisão do Wagner, 28/10/2026): oportunidades com mais de 30 dias são apagadas; das que viraram
-- contato fica só o link (a legenda de terceiro é apagada). A API de hashtag não informa quem postou.

-- 1. Hashtags monitoradas (a Meta permite 30 hashtags diferentes a cada 7 dias por conta do Instagram) --------
create table if not exists imobinsta.radar_hashtags (
  id            uuid primary key default gen_random_uuid(),
  conta_id      uuid not null references imobinsta.contas(id) on delete cascade,
  hashtag       text not null check (hashtag ~ '^[a-z0-9_à-ÿ]{2,60}$'), -- sem "#", minúscula
  ig_hashtag_id text,                 -- id da Meta (ig_hashtag_search), guardado na primeira busca
  ativa         boolean not null default true,
  ultima_busca  timestamptz,
  ultimo_erro   text,
  criado_em     timestamptz not null default now(),
  unique (conta_id, hashtag)
);

revoke all on imobinsta.radar_hashtags from anon, public, authenticated;
grant select, delete on imobinsta.radar_hashtags to authenticated;
grant insert (conta_id, hashtag) on imobinsta.radar_hashtags to authenticated;
grant update (ativa) on imobinsta.radar_hashtags to authenticated;
grant all on imobinsta.radar_hashtags to service_role;

alter table imobinsta.radar_hashtags enable row level security;
drop policy if exists radar_hashtags_ler on imobinsta.radar_hashtags;
create policy radar_hashtags_ler on imobinsta.radar_hashtags for select to authenticated using (imobinsta.eh_membro(conta_id));
drop policy if exists radar_hashtags_incluir on imobinsta.radar_hashtags;
create policy radar_hashtags_incluir on imobinsta.radar_hashtags for insert to authenticated with check (imobinsta.eh_membro(conta_id));
drop policy if exists radar_hashtags_editar on imobinsta.radar_hashtags;
create policy radar_hashtags_editar on imobinsta.radar_hashtags for update to authenticated
  using (imobinsta.eh_membro(conta_id)) with check (imobinsta.eh_membro(conta_id));
drop policy if exists radar_hashtags_excluir on imobinsta.radar_hashtags;
create policy radar_hashtags_excluir on imobinsta.radar_hashtags for delete to authenticated using (imobinsta.eh_membro(conta_id));

-- Até 30 ativas por conta (o limite semanal da Meta).
create or replace function imobinsta.radar_hashtags_limite()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.ativa and (select count(*) from imobinsta.radar_hashtags h
                     where h.conta_id = new.conta_id and h.ativa and h.id <> new.id) >= 30 then
    raise exception 'Limite de 30 hashtags ativas (regra da Meta: 30 por semana).' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists radar_hashtags_limite on imobinsta.radar_hashtags;
create trigger radar_hashtags_limite before insert or update of ativa on imobinsta.radar_hashtags
  for each row execute function imobinsta.radar_hashtags_limite();

-- 2. Oportunidades (posts públicos achados pela hashtag) -----------------------------------------------------
create table if not exists imobinsta.radar_oportunidades (
  id                  uuid primary key default gen_random_uuid(),
  conta_id            uuid not null references imobinsta.contas(id) on delete cascade,
  hashtag_id          uuid references imobinsta.radar_hashtags(id) on delete set null,
  hashtag             text not null,
  ig_media_id         text not null,
  permalink           text,
  legenda             text check (legenda is null or char_length(legenda) <= 2200),
  tipo_midia          text,
  publicado_em        timestamptz,
  curtidas            integer,
  comentarios         integer,
  relevante           boolean,                  -- null = a IA ainda não leu
  dor                 text check (dor is null or char_length(dor) <= 60),
  produto_sugerido    text check (produto_sugerido is null or char_length(produto_sugerido) <= 60),
  comentario_sugerido text check (comentario_sugerido is null or char_length(comentario_sugerido) <= 600),
  classificado_em     timestamptz,
  status              text not null default 'nova' check (status in ('nova', 'em_contato', 'descartada')),
  contato_em          timestamptz,
  criado_em           timestamptz not null default now(),
  unique (conta_id, ig_media_id)
);
create index if not exists radar_oportunidades_conta_idx on imobinsta.radar_oportunidades (conta_id, status, criado_em desc);
create index if not exists radar_oportunidades_contato_idx on imobinsta.radar_oportunidades (conta_id, contato_em desc) where contato_em is not null;

-- O membro edita o comentário e descarta/recupera; "em contato" só pela RPC radar_contato (limite de ritmo).
revoke all on imobinsta.radar_oportunidades from anon, public, authenticated;
grant select on imobinsta.radar_oportunidades to authenticated;
grant update (status, comentario_sugerido) on imobinsta.radar_oportunidades to authenticated;
grant all on imobinsta.radar_oportunidades to service_role;

alter table imobinsta.radar_oportunidades enable row level security;
drop policy if exists radar_oportunidades_ler on imobinsta.radar_oportunidades;
create policy radar_oportunidades_ler on imobinsta.radar_oportunidades for select to authenticated using (imobinsta.eh_membro(conta_id));
drop policy if exists radar_oportunidades_editar on imobinsta.radar_oportunidades;
create policy radar_oportunidades_editar on imobinsta.radar_oportunidades for update to authenticated
  using (imobinsta.eh_membro(conta_id) and status in ('nova', 'descartada'))
  with check (imobinsta.eh_membro(conta_id) and status in ('nova', 'descartada'));

-- 3. Contato manual com limite de ritmo humano ---------------------------------------------------------------
create or replace function imobinsta.radar_contato(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_conta  uuid;
  v_status text;
  v_hoje   integer;
  v_ultimo timestamptz;
  v_inicio timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  select o.conta_id, o.status into v_conta, v_status from imobinsta.radar_oportunidades o where o.id = p_id;
  if v_conta is null or not imobinsta.eh_membro(v_conta) then
    raise exception 'Oportunidade não encontrada.' using errcode = 'P0002';
  end if;
  if v_status = 'em_contato' then
    return jsonb_build_object('ok', true, 'ja_era', true);
  end if;

  -- Trava por conta: dois cliques ao mesmo tempo não furam o limite.
  perform pg_advisory_xact_lock(hashtext('imobinsta_radar_' || v_conta::text));
  select count(*), max(o.contato_em) into v_hoje, v_ultimo
    from imobinsta.radar_oportunidades o where o.conta_id = v_conta and o.contato_em >= v_inicio;
  if v_hoje >= 20 then
    raise exception 'Limite de 20 comentários por dia atingido. Volte amanhã.' using errcode = 'P0001';
  end if;
  if v_ultimo is not null and v_ultimo > now() - interval '3 minutes' then
    raise exception 'Espere % s para o próximo comentário (ritmo de pessoa, não de robô).',
      ceil(extract(epoch from (v_ultimo + interval '3 minutes' - now())))::int using errcode = 'P0001';
  end if;

  update imobinsta.radar_oportunidades set status = 'em_contato', contato_em = now() where id = p_id;
  return jsonb_build_object('ok', true, 'hoje', v_hoje + 1);
end;
$$;
revoke all on function imobinsta.radar_contato(uuid) from public, anon;
grant execute on function imobinsta.radar_contato(uuid) to authenticated;

-- 4. Retenção de 30 dias (LGPD) -------------------------------------------------------------------------------
create or replace function imobinsta.radar_limpar()
returns void language sql security definer set search_path = '' as $$
  delete from imobinsta.radar_oportunidades
   where status <> 'em_contato' and criado_em < now() - interval '30 days';
  update imobinsta.radar_oportunidades
     set legenda = null
   where status = 'em_contato' and legenda is not null and criado_em < now() - interval '30 days';
$$;
revoke all on function imobinsta.radar_limpar() from public, anon, authenticated;

-- 5. Busca semanal: pg_cron → ig-hashtag (mesmo segredo do sync diário, conferido por sync_cron_confere) ---------
create or replace function imobinsta.radar_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_segredo text;
begin
  if not exists (
    select 1 from imobinsta.radar_hashtags h
      join imobinsta.conexoes c on c.conta_id = h.conta_id and c.provedor = 'instagram' and c.status = 'conectado'
     where h.ativa
  ) then
    return;
  end if;
  select d.decrypted_secret into v_segredo from vault.decrypted_secrets d where d.name = 'imobinsta_sync_cron_segredo';
  perform net.http_post(
    url     := 'https://ikvjaowvpvxojvcfwnct.supabase.co/functions/v1/ig-hashtag',
    body    := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-segredo', v_segredo),
    timeout_milliseconds := 120000
  );
end;
$$;
revoke all on function imobinsta.radar_tick() from public, anon, authenticated;

-- Segunda 10:00 UTC (07:00 em Brasília) a busca; todo dia 06:30 UTC a limpeza. Mesmo nome = atualiza o job.
select cron.schedule('imobinsta-radar-semanal', '0 10 * * 1', 'select imobinsta.radar_tick()');
select cron.schedule('imobinsta-radar-limpeza', '30 6 * * *', 'select imobinsta.radar_limpar()');
