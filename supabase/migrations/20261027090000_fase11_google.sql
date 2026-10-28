-- imobinsta — Fase 11: conexão Google (OAuth drive.file) para a ponte com o Google Vids pelo Drive.
-- Aditiva e idempotente. Depende de 20261026020000_fase1_contas_membros_conexoes.sql.
--
-- O refresh token do Google fica no Vault (salvar_segredo_conexao), como o token do Instagram.
-- Aqui só entra o provedor 'google' na lista e a linha de status de cada conta.

-- 1. 'google' passa a ser um provedor válido (a lista nova contém a antiga) --------------------
alter table imobinsta.conexoes drop constraint if exists conexoes_provedor_check;
alter table imobinsta.conexoes add constraint conexoes_provedor_check
  check (provedor in ('instagram', 'chatfyre', 'gemini', 'openai', 'heygen', 'fal', 'google'));

-- 2. Linha "A conectar" para cada conta que ainda não tem ------------------------------------
insert into imobinsta.conexoes (conta_id, provedor, status, detalhe)
select c.id, 'google', 'a_conectar', 'Google Drive → Google Vids (Fase 11) · grátis'
  from imobinsta.contas c
on conflict (conta_id, provedor) do nothing;

notify pgrst, 'reload schema';
