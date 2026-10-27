-- Testes de acesso (pgTAP) para classes e personagens.
-- Rodar com Supabase local:      npx supabase test db
-- Rodar sem Docker (Postgres 16): npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

-- Usuários de teste
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local');

-- Sessão simulada: `set local role` + o JWT que o Supabase coloca em cada requisição.
-- `reset role` volta ao superusuário antes de trocar de usuário.
-- RLS ligado
select ok((select relrowsecurity from pg_class where oid = 'public.characters'::regclass), 'RLS ativo em characters');
select ok((select relrowsecurity from pg_class where oid = 'public.classes'::regclass), 'RLS ativo em classes');

-- Catálogo de classes: público e só leitura
reset role; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.classes), 12, 'anônimo lê as 12 classes');
select throws_ok($$ insert into public.classes (id, name, path_id, unlock_level) values ('x','X','magic',0) $$,
  '42501', null, 'anônimo não insere classe');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ update public.classes set playable = true where id = 'warrior' $$,
  '42501', null, 'usuário não altera o catálogo');

-- Criação de personagem pela função de servidor
select lives_ok($$ select public.create_character('Aldric', 'mage') $$, 'A cria um Mago');
select is((select count(*)::int from public.characters), 1, 'A vê 1 personagem');
select is((select level from public.characters where name = 'Aldric'), 0, 'personagem começa no nível 0');
select is((select copper + gold from public.characters where name = 'Aldric'), 0::bigint, 'personagem começa sem moedas');
select throws_ok($$ select public.create_character('Bruna', 'dragao') $$,
  '22023', null, 'classe que não existe é recusada');
select throws_ok($$ select public.create_character('Feiticeiro1', 'sorcerer') $$,
  '22023', null, 'classe de evolução não pode ser criada direto');
select throws_ok($$ select public.create_character('a b', 'mage') $$,
  '22023', null, 'nome inválido é recusado');
select throws_ok($$ select public.create_character('ALDRIC', 'mage') $$,
  '23505', null, 'nome repetido (sem diferenciar maiúsculas) é recusado');

-- Escrita direta é proibida, mesmo nas próprias linhas
select throws_ok($$ insert into public.characters (user_id, name, class_id)
  values ('00000000-0000-0000-0000-00000000000a', 'Hacker', 'mage') $$, '42501', null, 'insert direto é negado');
select throws_ok($$ update public.characters set copper = 999999 where name = 'Aldric' $$,
  '42501', null, 'cliente não altera as próprias moedas');
select throws_ok($$ update public.characters set level = 75 where name = 'Aldric' $$,
  '42501', null, 'cliente não altera o próprio nível');
select throws_ok($$ delete from public.characters where name = 'Aldric' $$,
  '42501', null, 'delete direto é negado');

-- Isolamento entre usuários
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from public.characters), 0, 'B não vê o personagem de A');
select lives_ok($$ select public.create_character('Brienne', 'mage') $$, 'B cria o próprio Mago');
select is((select array_agg(name) from public.characters), array['Brienne'], 'B vê só o próprio personagem');

-- Limite provisório de 3 personagens por conta
select public.create_character('Brienne2', 'mage');
select public.create_character('Brienne3', 'mage');
select throws_ok($$ select public.create_character('Brienne4', 'mage') $$,
  'P0001', null, 'quarto personagem é recusado');

-- Anônimo não cria personagem nem lê personagens
reset role; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.create_character('Anon', 'mage') $$, '42501', null, 'anônimo não chama create_character');

reset role;
select * from finish();
rollback;
