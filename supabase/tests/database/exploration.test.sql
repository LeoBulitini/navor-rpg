-- Testes (pgTAP) de exploração, coleta e inventário.
-- Rodar com Supabase local:      npx supabase test db
-- Rodar sem Docker (Postgres 16): npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(35);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local');

-- Um personagem para cada usuário
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select public.create_character('Aldric', 'mage');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select public.create_character('Brienne', 'mage');
reset role;
create temp table t (k text primary key, v text);
grant all on t to authenticated;
insert into t select 'char_a', id::text from public.characters where name = 'Aldric';
insert into t select 'char_b', id::text from public.characters where name = 'Brienne';

-- RLS ligado em tudo
select ok(bool_and(relrowsecurity), 'RLS ativo nas tabelas novas')
from pg_class where oid in ('public.items'::regclass, 'public.exploration_areas'::regclass, 'public.area_rarity_rules'::regclass,
  'public.area_items'::regclass, 'public.explorations'::regclass, 'public.exploration_nodes'::regclass, 'public.inventory_items'::regclass);

-- Catálogo de itens público e só leitura; regras internas invisíveis
reset role; set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);
select ok((select count(*) from public.items) > 0, 'anônimo lê o catálogo de itens');
select throws_ok($$ select * from public.area_rarity_rules $$, '42501', null, 'anônimo não lê as regras de sorteio');
select throws_ok($$ select public.start_exploration((select v::uuid from t where k = 'char_a'), 'cave') $$,
  '42501', null, 'anônimo não chama start_exploration');

-- ---------------------------------------------------------------------------
-- A entra na Gruta
-- ---------------------------------------------------------------------------
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select * from public.area_items $$, '42501', null, 'usuário não lê os itens de cada área');
select throws_ok($$ select * from public.explorations $$, '42501', null, 'usuário não lê a tabela de explorações direto');
select throws_ok($$ insert into public.inventory_items (character_id, item_id, quantity)
  values ((select v::uuid from t where k = 'char_a'), 'iron', 999) $$, '42501', null, 'usuário não grava no inventário direto');
select throws_ok($$ select public.start_exploration((select v::uuid from t where k = 'char_b'), 'cave') $$,
  'P0001', 'Personagem não encontrado', 'A não entra na Gruta com o personagem de B');
select throws_ok($$ select public.start_exploration((select v::uuid from t where k = 'char_a'), 'dragao') $$,
  '22023', null, 'área desconhecida é recusada');

insert into t select 'run1', public.start_exploration((select v::uuid from t where k = 'char_a'), 'cave')::text;
select ok((select (v::jsonb ->> 'seed')::bigint between 0 and 4294967295 from t where k = 'run1'), 'servidor devolve uma seed de 32 bits');
select ok((select jsonb_array_length(v::jsonb -> 'nodes') between 8 and 12 from t where k = 'run1'), 'entre 8 e 12 pontos de coleta');

reset role;
select is((select count(*)::int from public.exploration_nodes n
  where n.exploration_id = (select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run1')
    and n.item_id not in (select item_id from public.area_items where area_id = 'cave')), 0,
  'todos os pontos usam itens da Gruta');
select is((select count(*)::int from public.exploration_nodes n
  join public.items i on i.id = n.item_id
  join public.area_rarity_rules r on r.area_id = 'cave' and r.rarity = i.rarity
  where n.exploration_id = (select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run1')
    and n.quantity not between r.qty_min and r.qty_max), 0,
  'quantidade de cada ponto dentro da faixa da raridade');

-- ---------------------------------------------------------------------------
-- Coleta
-- ---------------------------------------------------------------------------
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into t select 'c0', public.collect_node((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run1'), 0)::text;
select is((select (v::jsonb ->> 'collected')::boolean from t where k = 'c0'), true, 'A coleta o ponto 0');
select is((select quantity from public.inventory_items where item_id = (select v::jsonb ->> 'item_id' from t where k = 'c0')),
  (select (v::jsonb ->> 'quantity')::bigint from t where k = 'c0'), 'o item aparece no inventário de A com a quantidade do ponto');

-- Repetir a mesma coleta (recarregar, clique duplo, reconectar) não duplica
insert into t select 'c0b', public.collect_node((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run1'), 0)::text;
select is((select (v::jsonb ->> 'collected')::boolean from t where k = 'c0b'), false, 'coletar de novo o mesmo ponto devolve collected = false');
select is((select sum(quantity) from public.inventory_items), (select (v::jsonb ->> 'quantity')::numeric from t where k = 'c0'),
  'o inventário não muda na coleta repetida');

-- Intervalo mínimo entre coletas
select throws_ok($$ select public.collect_node((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run1'), 1) $$,
  'P0001', 'Aguarde um instante para coletar de novo.', 'coleta logo em seguida é recusada');
reset role;
update public.explorations set last_collect_at = clock_timestamp() - interval '1 second'
  where id = (select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run1');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((public.collect_node((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run1'), 1) ->> 'collected')::boolean, true,
  'depois do intervalo, o ponto 1 é coletado');
select throws_ok($$ select public.collect_node((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run1'), 99) $$,
  '22023', null, 'ponto que não existe é recusado');
select throws_ok($$ select public.collect_node(gen_random_uuid(), 0) $$, 'P0001', 'Exploração não encontrada', 'exploração inexistente é recusada');
select throws_ok($$ update public.inventory_items set quantity = 999999 $$, '42501', null, 'cliente não altera a quantidade do inventário');
select throws_ok($$ delete from public.inventory_items $$, '42501', null, 'cliente não apaga itens do inventário');

-- ---------------------------------------------------------------------------
-- Isolamento entre usuários
-- ---------------------------------------------------------------------------
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from public.inventory_items), 0, 'B não vê o inventário de A');
select throws_ok($$ select public.collect_node((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run1'), 2) $$,
  'P0001', 'Exploração não encontrada', 'B não coleta na exploração de A');
reset role;
select is((select collected_at from public.exploration_nodes
  where exploration_id = (select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run1') and node_index = 2), null,
  'o ponto 2 continua disponível depois da tentativa de B');

-- ---------------------------------------------------------------------------
-- Fim da exploração: vencida, ou encerrada ao entrar de novo
-- ---------------------------------------------------------------------------
update public.explorations set last_collect_at = null, expires_at = now() - interval '1 second'
  where id = (select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run1');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select public.collect_node((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run1'), 2) $$,
  'P0001', 'Esta exploração terminou. Entre na área de novo.', 'exploração vencida não aceita coleta');
reset role;
update public.explorations set expires_at = now() + interval '30 minutes'
  where id = (select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run1');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into t select 'run2', public.start_exploration((select v::uuid from t where k = 'char_a'), 'cave')::text;
select throws_ok($$ select public.collect_node((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run1'), 2) $$,
  'P0001', 'Esta exploração terminou. Entre na área de novo.', 'entrar de novo encerra a exploração anterior');
select is((public.collect_node((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run2'), 0) ->> 'collected')::boolean, true,
  'na exploração nova a coleta funciona');
reset role;
select is((select count(*)::int from public.explorations where character_id = (select v::uuid from t where k = 'char_a') and closed_at is null), 1,
  'só uma exploração ativa por personagem');

-- Limite de entradas por minuto (10 na Gruta): já são 2, mais 8 passam e a 11.ª é recusada
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select lives_ok($$ select public.start_exploration((select v::uuid from t where k = 'char_a'), 'cave') from generate_series(1, 8) $$,
  'até 10 entradas por minuto');
select throws_ok($$ select public.start_exploration((select v::uuid from t where k = 'char_a'), 'cave') $$,
  'P0001', 'Muitas entradas seguidas. Aguarde um minuto.', 'a 11.ª entrada no mesmo minuto é recusada');

-- Sorteio: em muitas entradas, todas as raridades da Gruta aparecem e nenhuma de fora
reset role;
update public.explorations set started_at = now() - interval '2 minutes';
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select public.start_exploration((select v::uuid from t where k = 'char_b'), 'cave') from generate_series(1, 10);
reset role;
select is((select array_agg(distinct i.rarity order by i.rarity) from public.exploration_nodes n join public.items i on i.id = n.item_id),
  array['common', 'rare', 'uncommon'], 'as raridades sorteadas são as da Gruta (Comum, Incomum e Raro)');
select ok((select count(*) filter (where i.rarity = 'common')::numeric / count(*) between 0.55 and 0.85
  from public.exploration_nodes n join public.items i on i.id = n.item_id), 'cerca de 70% dos pontos são comuns');

-- Personagem apagado leva junto explorações e inventário
delete from public.characters where name = 'Aldric';
select is((select count(*)::int from public.inventory_items), 0, 'apagar o personagem apaga o inventário dele');

select * from finish();
rollback;
