-- Testes (pgTAP) das missões diárias e do Covil do Dragão: dia de Brasília, sorteio, progresso pelo servidor,
-- recompensa uma vez só e uma entrada por dia no Covil.
-- Rodar com Supabase local:      npx supabase test db
-- Rodar sem Docker (Postgres 16): npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(30);

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
create function pg_temp.a() returns uuid language sql as $$ select v::uuid from t where k = 'a' $$;
create function pg_temp.run() returns uuid language sql as $$ select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run' $$;
grant execute on function pg_temp.a() to authenticated;
grant execute on function pg_temp.run() to authenticated;

select ok(bool_and(relrowsecurity), 'RLS ativo nas tabelas de missões e entradas diárias')
from pg_class where oid in ('public.quest_rules'::regclass, 'public.quest_templates'::regclass, 'public.quest_reward_items'::regclass,
  'public.daily_quests'::regclass, 'public.daily_area_entries'::regclass);
select is(public.game_day(), (now() at time zone 'America/Sao_Paulo')::date, 'o dia do jogo é o de Brasília');
select ok((select daily and min_level = 5 from public.exploration_areas where id = 'dragon-lair'), 'o Covil é diário e pede nível 5');

-- Sorteio
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select * from public.quest_templates $$, '42501', null, 'usuário não lê o catálogo direto');
select throws_ok($$ select public.ensure_daily_quests(pg_temp.a()) $$, '42501', null, 'usuário não sorteia missões direto');
select throws_ok($$ select public.quest_advance(pg_temp.a(), 'kill', 'cave-rat', 99) $$, '42501', null, 'usuário não avança missão direto');
insert into t select 'l1', public.list_daily_quests(pg_temp.a())::text;
select is(jsonb_array_length((select v::jsonb -> 'quests' from t where k = 'l1')), 3, 'três missões no dia');
select is((public.list_daily_quests(pg_temp.a()) -> 'quests'), (select v::jsonb -> 'quests' from t where k = 'l1'), 'abrir de novo não sorteia outras');
reset role;
select ok((select bool_and(q.min_level = 0) from public.daily_quests d join public.quest_templates q on q.id = d.quest_id), 'nível 0 só recebe missões do nível 0');

-- Missões escolhidas para o teste: abates de rato, cogumelos e o Dragão.
delete from public.daily_quests where character_id = pg_temp.a();
insert into public.daily_quests (character_id, day, slot, quest_id) values
  (pg_temp.a(), public.game_day(), 0, 'rats'), (pg_temp.a(), public.game_day(), 1, 'mushrooms'), (pg_temp.a(), public.game_day(), 2, 'dragon');

-- Progresso pelo servidor
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into t select 'run', public.start_exploration(pg_temp.a(), 'cave')::text;
reset role;
update public.exploration_monsters set creature_id = 'cave-rat' where exploration_id = pg_temp.run();
update public.exploration_nodes set item_id = 'mushroom-common', quantity = 5 where exploration_id = pg_temp.run() and node_index = 0;
update public.explorations set started_at = now() - interval '10 minutes' where id = pg_temp.run();
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select public.kill_monster(pg_temp.run(), 0);
select is((select progress from public.daily_quests where quest_id = 'rats'), 1, 'abater um rato conta 1');
select public.kill_monster(pg_temp.run(), 0);
select is((select progress from public.daily_quests where quest_id = 'rats'), 1, 'repetir o mesmo abate não conta de novo');
select public.collect_node(pg_temp.run(), 0);
select is((select progress from public.daily_quests where quest_id = 'mushrooms'), 4, 'coletar 5 cogumelos completa a missão de 4 (sem passar)');
select is((select progress from public.daily_quests where quest_id = 'dragon'), 0, 'o Dragão não conta com ratos');
select throws_ok($$ select public.claim_quest(pg_temp.a(), 1) $$, 'P0001', 'Volte para a cidade para usar este serviço.', 'recompensa só na cidade');
select public.end_exploration(pg_temp.run());

-- Recompensa
select throws_ok($$ select public.claim_quest(pg_temp.a(), 0) $$, 'P0001', 'A missão ainda não foi concluída.', 'missão incompleta não paga');
insert into t select 'c1', public.claim_quest(pg_temp.a(), 1)::text;
select is((select (v::jsonb ->> 'xp_gained')::int from t where k = 'c1'), 30, 'paga o XP da missão (30)');
select is((select (v::jsonb ->> 'copper_gained')::int from t where k = 'c1'), 10, 'paga o cobre da missão (10)');
select is((select xp from public.characters where name = 'Aldric'),
  38::bigint, 'o XP fica gravado (30 da missão + 8 do rato)');
select throws_ok($$ select public.claim_quest(pg_temp.a(), 1) $$, 'P0001', 'Você já recebeu esta recompensa.', 'não paga duas vezes');
select throws_ok($$ select public.claim_quest(pg_temp.a(), 7) $$, 'P0001', 'Missão não encontrada.', 'vaga inexistente');
select is((select (claimed)::boolean from jsonb_to_recordset(public.list_daily_quests(pg_temp.a()) -> 'quests') as x(slot int, claimed boolean) where slot = 1), true, 'a lista mostra a recebida');

-- Recompensa com item
reset role; update public.daily_quests set progress = 1 where quest_id = 'dragon';
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select public.claim_quest(pg_temp.a(), 2);
select is((select quantity from public.inventory_items where item_id = 'scroll-rare'), 1::bigint, 'a missão do Dragão dá o Pergaminho Raro');

-- Covil do Dragão: nível mínimo e uma entrada por dia
reset role; update public.characters set level = 4 where name = 'Aldric';
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select public.start_exploration(pg_temp.a(), 'dragon-lair') $$, 'P0001', 'Você precisa estar no nível 5 para entrar aqui.', 'nível 4 não entra no Covil');
reset role; update public.characters set level = 5 where name = 'Aldric';
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into t select 'lair', public.start_exploration(pg_temp.a(), 'dragon-lair')::text;
select is((select v::jsonb -> 'monsters' -> 0 ->> 'creature_id' from t where k = 'lair'), 'dragon', 'o Covil tem o Dragão');
select public.end_exploration((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'lair'));
select throws_ok($$ select public.start_exploration(pg_temp.a(), 'dragon-lair') $$, 'P0001',
  'Você já entrou aqui hoje. Volte amanhã (o dia vira à meia-noite, horário de Brasília).', 'segunda entrada no mesmo dia é recusada');
select ok(public.start_exploration(pg_temp.a(), 'cave') ? 'seed', 'a Gruta continua liberada');
select is((public.list_daily_quests(pg_temp.a()) -> 'daily_areas'), '["dragon-lair"]'::jsonb, 'a lista diz que o Covil já foi usado hoje');
reset role; update public.daily_area_entries set day = day - 1 where character_id = pg_temp.a();
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select ok(public.start_exploration(pg_temp.a(), 'dragon-lair') ? 'seed', 'no dia seguinte entra de novo');

-- Outro jogador
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*) from public.daily_quests), 0::bigint, 'B não vê as missões de A');
select throws_ok($$ select public.claim_quest(pg_temp.a(), 0) $$, 'P0001', 'Personagem não encontrado', 'B não recebe recompensa de A');

select * from finish();
rollback;
