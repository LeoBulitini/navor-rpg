-- Testes (pgTAP) das habilidades: pontos, graduações, focos com pergaminho, evolução de classe e bônus no servidor.
-- Rodar com Supabase local:      npx supabase test db
-- Rodar sem Docker (Postgres 16): npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(27);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local');

reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select public.create_character('Aldric', 'mage');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select public.create_character('Brena', 'archer');
reset role;
create temp table t (k text primary key, v text);
grant all on t to authenticated;
insert into t select 'a', id::text from public.characters where name = 'Aldric';
insert into t select 'b', id::text from public.characters where name = 'Brena';
create function pg_temp.a() returns uuid language sql as $$ select v::uuid from t where k = 'a' $$;
create function pg_temp.b() returns uuid language sql as $$ select v::uuid from t where k = 'b' $$;
grant execute on function pg_temp.a() to authenticated;
grant execute on function pg_temp.b() to authenticated;

select ok(bool_and(relrowsecurity), 'RLS ativo nas tabelas de habilidade')
from pg_class where oid in ('public.skill_rules'::regclass, 'public.skills'::regclass, 'public.skill_grades'::regclass,
  'public.class_evolution'::regclass, 'public.character_skills'::regclass);
select is((select count(*) from public.skills), 48::bigint, '12 classes com 4 habilidades cada');
select is((select max(grade) from public.skill_grades where skill_id = 'arcane-burst'), 7, 'a habilidade ativa vai até o foco 7');
select is((select sum(points) from public.skill_grades where skill_id = 'mage-power'), 6::bigint, 'um aprimoramento custa 6 pontos no total');

reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select * from public.skill_grades $$, '42501', null, 'usuário não lê os custos direto');
select throws_ok($$ select public.skill_points_spent(pg_temp.a()) $$, '42501', null, 'usuário não chama a função interna de pontos');

-- Pontos
select throws_ok($$ select public.learn_skill(pg_temp.a(), 'arcane-burst') $$, 'P0001', 'Pontos de habilidade insuficientes.', 'nível 0 não tem pontos');
reset role; update public.characters set level = 3 where name = 'Aldric';
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into t select 'l1', public.learn_skill(pg_temp.a(), 'arcane-burst')::text;
select is((select (v::jsonb ->> 'grade')::int from t where k = 'l1'), 1, 'aprende a habilidade ativa (foco 1)');
select is((select (v::jsonb ->> 'points_left')::int from t where k = 'l1'), 2, 'sobram 2 dos 3 pontos');
select throws_ok($$ select public.learn_skill(pg_temp.a(), 'arcane-burst') $$, 'P0001', 'Falta o pergaminho deste foco.', 'foco 2 pede o Pergaminho Simples');
reset role; insert into public.inventory_items (character_id, item_id, quantity) values (pg_temp.a(), 'scroll-simple', 1);
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into t select 'l2', public.learn_skill(pg_temp.a(), 'arcane-burst')::text;
select is((select (v::jsonb ->> 'grade')::int from t where k = 'l2'), 2, 'com o pergaminho, vai ao foco 2');
select ok(not exists (select 1 from public.inventory_items where item_id = 'scroll-simple'), 'o pergaminho é gasto');
insert into t select 'p1', public.learn_skill(pg_temp.a(), 'mage-power')::text;
select is((select (v::jsonb ->> 'points_left')::int from t where k = 'p1'), 0, 'a 1.ª graduação custa 1 ponto');
select throws_ok($$ select public.learn_skill(pg_temp.a(), 'mage-power') $$, 'P0001', 'Pontos de habilidade insuficientes.', 'a 2.ª graduação custa 2 pontos');
select throws_ok($$ select public.learn_skill(pg_temp.a(), 'whirlwind') $$, 'P0001', 'Sua classe não tem esta habilidade.', 'Mago não aprende do Guerreiro');
select throws_ok($$ select public.learn_skill(pg_temp.a(), 'focused-ray') $$, 'P0001', 'Sua classe não tem esta habilidade.', 'nem do Feiticeiro antes de evoluir');
select is((select grade from public.character_skills where skill_id = 'mage-power'), 1, 'a graduação fica gravada');

-- Evolução
select throws_ok($$ select public.evolve_class(pg_temp.a()) $$, 'P0001', 'Nível insuficiente para evoluir.', 'precisa do nível 25');
reset role; update public.characters set level = 25, copper = 499 where name = 'Aldric';
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select public.evolve_class(pg_temp.a()) $$, 'P0001', 'Cobre insuficiente.', 'a evolução para Feiticeiro custa 500 de cobre');
reset role; update public.characters set copper = 600 where name = 'Aldric';
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into t select 'ev', public.evolve_class(pg_temp.a())::text;
select is((select v::jsonb ->> 'class_id' from t where k = 'ev'), 'sorcerer', 'o Mago vira Feiticeiro');
select is((select copper from public.characters where name = 'Aldric'), 100::bigint, 'e paga 500 de cobre');
select is((public.learn_skill(pg_temp.a(), 'focused-ray') ->> 'grade')::int, 1, 'o Feiticeiro aprende a habilidade dele');
select is((select count(*) from public.character_skills where character_id = pg_temp.a()), 3::bigint, 'e mantém as do Mago');

-- Bônus no servidor
reset role;
insert into public.character_skills (character_id, skill_id, grade) values (pg_temp.b(), 'game-gathering', 3);
select is(public.skill_drop_bonus(pg_temp.b()), 30::numeric, 'Coleta de Caça 3 dá 30% a mais na chance de itens');
select is(public.skill_points_spent(pg_temp.a()), 4, 'pontos gastos: Explosão Arcana foco 2 (2) + Poder Mágico 1 (1) + Raio Concentrado 1 (1)');

-- Outro jogador
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*) from public.character_skills), 1::bigint, 'B só vê as próprias habilidades');
select throws_ok($$ select public.learn_skill(pg_temp.a(), 'mage-power') $$, 'P0001', 'Personagem não encontrado', 'B não sobe habilidade de A');

select * from finish();
rollback;
