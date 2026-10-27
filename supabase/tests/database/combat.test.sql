-- Testes (pgTAP) de monstros, abate, XP, nível e cobre.
-- Rodar com Supabase local:      npx supabase test db
-- Rodar sem Docker (Postgres 16): npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

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

select ok(bool_and(relrowsecurity), 'RLS ativo nas tabelas novas')
from pg_class where oid in ('public.creatures'::regclass, 'public.creature_drops'::regclass, 'public.area_creatures'::regclass,
  'public.level_thresholds'::regclass, 'public.combat_rules'::regclass, 'public.exploration_monsters'::regclass);
select is((select total_xp from public.level_thresholds where level = 0), 0::bigint, 'nível 0 começa com 0 XP');
select is((select count(*)::int from public.level_thresholds), 76, 'tabela de XP vai do nível 0 ao 75');

-- A entra na Gruta: vêm monstros
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select * from public.exploration_monsters $$, '42501', null, 'usuário não lê os monstros direto');
select throws_ok($$ select * from public.creature_drops $$, '42501', null, 'usuário não lê a tabela de drops');
insert into t select 'run', public.start_exploration((select v::uuid from t where k = 'char_a'), 'cave')::text;
select ok((select jsonb_array_length(v::jsonb -> 'monsters') between 4 and 6 from t where k = 'run'), 'entre 4 e 6 monstros');
select ok((select bool_and(m ->> 'creature_id' in ('cave-rat', 'goblin-raider')) from t, jsonb_array_elements(v::jsonb -> 'monsters') m where k = 'run'),
  'só monstros da Gruta');

-- Abate logo ao entrar: rápido demais
select throws_ok($$ select public.kill_monster((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run'), 0) $$,
  'P0001', 'Abate rápido demais para ser válido.', 'abate no mesmo instante da entrada é recusado');

-- Um minuto depois, o abate vale
reset role;
update public.explorations set started_at = now() - interval '60 seconds'
  where id = (select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into t select 'k0', public.kill_monster((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run'), 0)::text;
select is((select (v::jsonb ->> 'killed')::boolean from t where k = 'k0'), true, 'A abate o monstro 0');
select is((select xp from public.characters where name = 'Aldric'), (select (v::jsonb ->> 'xp_gained')::bigint from t where k = 'k0'),
  'o XP do monstro vai para o personagem');
select ok((select (v::jsonb ->> 'xp_gained')::int > 0 from t where k = 'k0'), 'o abate dá XP');
select is((select copper from public.characters where name = 'Aldric'), (select (v::jsonb ->> 'copper_gained')::bigint from t where k = 'k0'),
  'o cobre sorteado vai para o personagem');
select is((select coalesce(sum(quantity), 0) from public.inventory_items),
  (select coalesce(sum((d ->> 'quantity')::int), 0)::numeric from t, jsonb_array_elements(v::jsonb -> 'drops') d where k = 'k0'),
  'os itens soltos entram no inventário');

-- Repetir o abate não dá nada
insert into t select 'k0b', public.kill_monster((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run'), 0)::text;
select is((select (v::jsonb ->> 'killed')::boolean from t where k = 'k0b'), false, 'abate repetido devolve killed = false');
select is((select xp from public.characters where name = 'Aldric'), (select (v::jsonb ->> 'xp_gained')::bigint from t where k = 'k0'),
  'o XP não muda no abate repetido');
select throws_ok($$ select public.kill_monster((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run'), 99) $$,
  '22023', null, 'monstro que não existe é recusado');
select throws_ok($$ update public.characters set xp = 999999 $$, '42501', null, 'cliente não altera o próprio XP');

-- Subir de nível: com XP suficiente, o nível acompanha a tabela
reset role;
update public.characters set xp = (select total_xp from public.level_thresholds where level = 3) - 1 where name = 'Aldric';
update public.explorations set started_at = now() - interval '10 minutes'
  where id = (select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into t select 'k1', public.kill_monster((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run'), 1)::text;
select is((select level from public.characters where name = 'Aldric'), 3, 'passar do XP do nível 3 sobe para o nível 3');
select is((select (v::jsonb ->> 'leveled_up')::boolean from t where k = 'k1'), true, 'a resposta avisa que subiu de nível');

-- Outro usuário
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok($$ select public.kill_monster((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run'), 2) $$,
  'P0001', 'Exploração não encontrada', 'B não abate na exploração de A');
select lives_ok($$ select public.end_exploration((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run')) $$,
  'B chamar end_exploration na exploração de A não dá erro...');
reset role;
select is((select closed_at from public.explorations where id = (select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run')), null,
  '...mas não encerra a exploração de A');

-- Morte: A encerra a exploração; depois disso não há abate
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select public.end_exploration((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run'));
select throws_ok($$ select public.kill_monster((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run'), 2) $$,
  'P0001', 'Esta exploração terminou. Entre na Gruta de novo.', 'depois da morte, a exploração não aceita abate');

reset role; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.kill_monster(gen_random_uuid(), 0) $$, '42501', null, 'anônimo não chama kill_monster');

select * from finish();
rollback;
