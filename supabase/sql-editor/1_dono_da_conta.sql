-- imobinsta — dá acesso de DONO à conta WSA para os logins do Wagner.
-- Rode no SQL Editor do ikvj DEPOIS das migrations 20261026010000 e 20261026020000.
-- Login único: o e-mail precisa já existir em auth.users (mesmo login dos outros sistemas WSA).
-- Ajuste a lista de e-mails se precisar.

insert into imobinsta.membros (conta_id, user_id, papel)
select '00000000-0000-4000-a000-000000000001', u.id, 'dono'
from auth.users u
where lower(u.email) in ('wagnersap@gmail.com', 'wsasistemas.ia@gmail.com')
on conflict (conta_id, user_id) do update set papel = 'dono', ativo = true;

-- Conferência: quem tem acesso
select u.email, m.papel, m.ativo
from imobinsta.membros m
join auth.users u on u.id = m.user_id
where m.conta_id = '00000000-0000-4000-a000-000000000001';
