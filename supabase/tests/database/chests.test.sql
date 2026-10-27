-- Testes (pgTAP) dos baús (open_chest) e da Floresta.
-- Rodar com Supabase local:      npx supabase test db
-- Rodar sem Docker (Postgres 16): npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(20);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local');

reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select public.create_character('Aldric', 'mage');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select public.create_character('Brienne', 'mage');
reset role;
create temp table t (k text primary key, v text);
grant all on t to authenticated;
insert into t select 'char_a', id::text from public.characters where name = 'Aldric';

select ok(bool_and(relrowsecurity), 'RLS ativo nas tabelas dos baús')
from pg_class where oid in ('public.area_chest_rules'::regclass, 'public.area_chest_items'::regclass, 'public.exploration_chests'::regclass);

-- A entra na Gruta: vêm de 1 a 2 baús
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select * from public.exploration_chests $$, '42501', null, 'usuário não lê os baús direto');
select throws_ok($$ select * from public.area_chest_items $$, '42501', null, 'usuário não lê o que os baús podem dar');
insert into t select 'run', public.start_exploration((select v::uuid from t where k = 'char_a'), 'cave')::text;
select ok((select (v::jsonb ->> 'chests')::int between 1 and 2 from t where k = 'run'), 'a Gruta tem de 1 a 2 baús');

-- Abrir logo ao entrar: recusado
select throws_ok($$ select public.open_chest((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run'), 0) $$,
  'P0001', 'O baú está emperrado. Tente de novo em alguns segundos.', 'baú aberto logo na entrada é recusado');

-- Um minuto depois, abre
reset role;
update public.explorations set started_at = now() - interval '60 seconds'
  where id = (select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into t select 'c0', public.open_chest((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run'), 0)::text;
select is((select (v::jsonb ->> 'opened')::boolean from t where k = 'c0'), true, 'A abre o baú 0');
select ok((select (v::jsonb ->> 'copper_gained')::int between 3 and 15 from t where k = 'c0'), 'cobre dentro da faixa da Gruta');
select is((select copper from public.characters where name = 'Aldric'), (select (v::jsonb ->> 'copper_gained')::bigint from t where k = 'c0'),
  'o cobre do baú vai para o personagem');
select is((select gold from public.characters where name = 'Aldric'), (select (v::jsonb ->> 'gold_gained')::bigint from t where k = 'c0'),
  'o ouro do baú (quando vem) vai para o personagem');
select is((select coalesce(sum(quantity), 0) from public.inventory_items),
  (select coalesce(sum((d ->> 'quantity')::int), 0)::numeric from t, jsonb_array_elements(v::jsonb -> 'drops') d where k = 'c0'),
  'os itens do baú entram no inventário');

-- Abrir de novo não dá nada
insert into t select 'c0b', public.open_chest((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run'), 0)::text;
select is((select (v::jsonb ->> 'opened')::boolean from t where k = 'c0b'), false, 'baú já aberto devolve opened = false');
select is((select copper from public.characters where name = 'Aldric'), (select (v::jsonb ->> 'copper_gained')::bigint from t where k = 'c0'),
  'o cobre não muda ao abrir de novo');
select throws_ok($$ select public.open_chest((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run'), 99) $$,
  '22023', null, 'baú que não existe é recusado');
select throws_ok($$ update public.characters set gold = 999 $$, '42501', null, 'cliente não altera o próprio ouro');

-- Outro usuário
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok($$ select public.open_chest((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run'), 0) $$,
  'P0001', 'Exploração não encontrada', 'B não abre baú na exploração de A');

-- Ouro: com chance 100%, o baú dá exatamente 1 moeda de ouro
reset role;
update public.area_chest_rules set gold_chance = 1 where area_id = 'cave';
insert into public.exploration_chests (exploration_id, chest_index)
  values ((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run'), 5), ((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run'), 6);
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into t select 'c5', public.open_chest((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run'), 5)::text;
select is((select (v::jsonb ->> 'gold_gained')::int from t where k = 'c5'), 1, 'chance de ouro 100% dá 1 moeda de ouro');

-- Floresta: só animais e recursos da Floresta; entrar nela encerra a Gruta
insert into t select 'forest', public.start_exploration((select v::uuid from t where k = 'char_a'), 'forest')::text;
reset role;
select ok((select bool_and(m ->> 'creature_id' in (select creature_id from public.area_creatures where area_id = 'forest'))
  from t, jsonb_array_elements(v::jsonb -> 'monsters') m where k = 'forest'), 'só animais da Floresta');
select ok((select bool_and(n ->> 'item_id' in (select item_id from public.area_items where area_id = 'forest'))
  from t, jsonb_array_elements(v::jsonb -> 'nodes') n where k = 'forest'), 'só recursos da Floresta');
select ok((select (v::jsonb ->> 'chests')::int between 0 and 1 from t where k = 'forest'), 'a Floresta tem no máximo 1 baú');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select public.open_chest((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run'), 6) $$,
  'P0001', 'Esta exploração terminou. Entre na área de novo.', 'baú de uma entrada encerrada não abre');

select * from finish();
rollback;
