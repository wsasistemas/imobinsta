-- imobinsta — Fase 7 (etapa 7.1): teto de gasto com IA paga e imagem gerada por IA.
-- Aditiva e idempotente. Depende de 20261027030000_fase4_criar.sql (geracoes_ia) e da Fase 1 (eh_membro/eh_dono).
--
-- O custo de cada geração fica em geracoes_ia.custo_usd (gravado só pelas Edge Functions).
-- A Edge Function ia-imagem soma o mês, bloqueia ao atingir o teto e pede confirmação acima do valor por geração.

create table if not exists imobinsta.config_ia (
  conta_id            uuid primary key references imobinsta.contas(id) on delete cascade,
  teto_mensal_usd     numeric(8, 2) not null default 30 check (teto_mensal_usd between 0 and 10000),
  confirmar_acima_usd numeric(8, 2) not null default 2 check (confirmar_acima_usd between 0 and 1000),
  provedor_imagem     text not null default 'openai' check (provedor_imagem in ('openai', 'fal')),
  atualizado_em       timestamptz not null default now()
);

revoke all on imobinsta.config_ia from anon, public, authenticated;
grant select on imobinsta.config_ia to authenticated;
grant insert (conta_id, teto_mensal_usd, confirmar_acima_usd, provedor_imagem) on imobinsta.config_ia to authenticated;
grant update (teto_mensal_usd, confirmar_acima_usd, provedor_imagem, atualizado_em) on imobinsta.config_ia to authenticated;
grant all on imobinsta.config_ia to service_role;

alter table imobinsta.config_ia enable row level security;
drop policy if exists config_ia_ler on imobinsta.config_ia;
create policy config_ia_ler on imobinsta.config_ia for select to authenticated using (imobinsta.eh_membro(conta_id));
drop policy if exists config_ia_incluir on imobinsta.config_ia;
create policy config_ia_incluir on imobinsta.config_ia for insert to authenticated with check (imobinsta.eh_dono(conta_id));
drop policy if exists config_ia_editar on imobinsta.config_ia;
create policy config_ia_editar on imobinsta.config_ia for update to authenticated
  using (imobinsta.eh_dono(conta_id)) with check (imobinsta.eh_dono(conta_id));

-- Gasto do mês corrente (fuso de Brasília). Membro de outra conta recebe null.
create or replace function imobinsta.gasto_ia_mes(p_conta uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select case when auth.role() = 'service_role' or imobinsta.eh_membro(p_conta) then
    coalesce((
      select sum(g.custo_usd) from imobinsta.geracoes_ia g
      where g.conta_id = p_conta
        and g.criado_em >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')
    ), 0)
  end;
$$;
revoke all on function imobinsta.gasto_ia_mes(uuid) from public, anon;
grant execute on function imobinsta.gasto_ia_mes(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
