-- imobinsta — Fase 11.2: pasta do Google Vids no Drive para cada roteiro.
-- Aditiva e idempotente. Depende de 20261027070000_fase7_avatar_reels.sql e 20261027090000_fase11_google.sql.
--
-- A Edge Function google-drive (ação "vids") cria no Drive "Estúdio imobinsta/Vids/<título>" com roteiro, legenda,
-- imagens e a subpasta "prontos/". Os ids ficam no roteiro; só o service_role grava (o update do app é por coluna
-- e estas colunas não entram no grant de 20261027070000).

alter table imobinsta.roteiros add column if not exists drive_pasta_id   text;
alter table imobinsta.roteiros add column if not exists drive_prontos_id text;
alter table imobinsta.roteiros add column if not exists drive_url        text check (drive_url is null or drive_url like 'https://drive.google.com/%');
alter table imobinsta.roteiros add column if not exists drive_criado_em  timestamptz;

notify pgrst, 'reload schema';
