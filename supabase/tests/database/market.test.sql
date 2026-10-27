-- Testes (pgTAP) do mercado entre jogadores e do armazém: anúncio guarda o item, compra atômica com taxa,
-- cancelar e recolher devolvem, limites, anúncios vencidos e armazém compartilhado pela conta.
-- Rodar com Supabase local:      npx supabase test db
-- Rodar sem Docker (Postgres 16): npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(37);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local');

reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select public.create_character('Aldric', 'mage');
select public.create_character('Aldra', 'warrior');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select public.create_character('Brena', 'archer');
reset role;
create temp table t (k text primary key, v text);
grant all on t to authenticated;
insert into t select 'a', id::text from public.characters where name = 'Aldric';
insert into t select 'a2', id::text from public.characters where name = 'Aldra';
insert into t select 'b', id::text from public.characters where name = 'Brena';
create function pg_temp.c(k text) returns uuid language sql as $$ select v::uuid from t where t.k = c.k $$;
create function pg_temp.l(k text) returns uuid language sql as $$ select (v::jsonb -> 'listing' ->> 'id')::uuid from t where t.k = l.k $$;
grant execute on function pg_temp.c(text) to authenticated;
grant execute on function pg_temp.l(text) to authenticated;
insert into public.inventory_items (character_id, item_id, quantity) values (pg_temp.c('a'), 'iron', 10), (pg_temp.c('a'), 'mushroom-common', 3);
insert into public.character_gear (character_id, item_id) values (pg_temp.c('a'), 'staff-apprentice');
insert into public.inventory_items (character_id, item_id, quantity) values (pg_temp.c('a'), 'staff-apprentice', 1);
update public.characters set copper = 1000 where name in ('Brena', 'Aldra');

select ok(bool_and(relrowsecurity), 'RLS ativo nas tabelas do mercado e do armazém')
from pg_class where oid in ('public.market_rules'::regclass, 'public.storage_rules'::regclass, 'public.market_listings'::regclass,
  'public.market_sales'::regclass, 'public.storage_items'::regclass);

-- Anunciar (A)
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select * from public.market_sales $$, '42501', null, 'usuário não lê o registro de vendas');
select throws_ok($$ select public.require_service('market', 'market') $$, '42501', null, 'usuário não chama função interna');
insert into t select 'l1', public.market_list(pg_temp.c('a'), 'market', 'iron', 6, 50, 'copper')::text;
select is((select (v::jsonb ->> 'total')::int from t where k = 'l1'), 4, 'anunciar 6 ferros tira 6 do inventário');
select throws_ok($$ select public.market_list(pg_temp.c('a'), 'market', 'staff-apprentice', 1, 10, 'copper') $$, 'P0001',
  'Equipamentos ainda não podem ir ao mercado nem ao armazém.', 'equipamento não vai ao mercado');
select throws_ok($$ select public.market_list(pg_temp.c('a'), 'market', 'iron', 1, 0, 'copper') $$, 'P0001', null, 'preço 0 é recusado');
select throws_ok($$ select public.market_list(pg_temp.c('a'), 'market', 'iron', 99, 5, 'copper') $$, 'P0001', 'Você não tem itens suficientes.', 'não anuncia o que não tem');
select throws_ok($$ select public.market_list(pg_temp.c('a'), 'alchemist', 'iron', 1, 5, 'copper') $$, '22023', 'Este serviço não fica aqui.', 'o mercado fica no Mercado');

-- Comprar (B)
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*) from public.market_listings), 1::bigint, 'B vê o anúncio de A');
select is((select seller_name from public.market_listings), 'Aldric', 'com o nome do vendedor');
insert into t select 'buy', public.market_buy(pg_temp.c('b'), 'market', pg_temp.l('l1'), 2)::text;
select is((select (v::jsonb ->> 'copper')::int from t where k = 'buy'), 900, 'B paga 2 × 50 de cobre');
select is((select (v::jsonb ->> 'total')::int from t where k = 'buy'), 2, 'e recebe 2 ferros');
select is((select (v::jsonb -> 'listing' ->> 'quantity')::int from t where k = 'buy'), 4, 'sobram 4 no anúncio');
select throws_ok($$ select public.market_buy(pg_temp.c('b'), 'market', pg_temp.l('l1'), 5) $$, 'P0001', 'O anúncio só tem 4 unidade(s).', 'não compra mais do que há');
reset role;
select is((select copper from public.characters where name = 'Aldric'), 95::bigint, 'A recebe 100 menos 5% de taxa');
select is((select tax from public.market_sales), 5::bigint, 'a venda fica registrada com a taxa');

-- Mesma conta não compra (A2)
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select public.market_buy(pg_temp.c('a2'), 'market', pg_temp.l('l1'), 1) $$, 'P0001', 'Você não pode comprar os próprios anúncios.', 'outro personagem da mesma conta não compra');

-- Cancelar (A)
insert into t select 'cancel', public.market_cancel(pg_temp.c('a'), 'market', pg_temp.l('l1'))::text;
select is((select (v::jsonb ->> 'total')::int from t where k = 'cancel'), 8, 'cancelar devolve os 4 ferros');
select throws_ok($$ select public.market_cancel(pg_temp.c('a'), 'market', pg_temp.l('l1')) $$, 'P0001', 'Este anúncio já foi encerrado.', 'não devolve duas vezes');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*) from public.market_listings), 0::bigint, 'B não vê mais o anúncio cancelado');
select throws_ok($$ select public.market_buy(pg_temp.c('b'), 'market', pg_temp.l('l1'), 1) $$, 'P0001', 'Este anúncio não está mais disponível.', 'anúncio cancelado não vende');
select throws_ok($$ select public.market_cancel(pg_temp.c('b'), 'market', pg_temp.l('l1')) $$, 'P0001', 'Anúncio não encontrado.', 'B não cancela anúncio de A');

-- Vencido: ninguém compra; o vendedor recolhe
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into t select 'l2', public.market_list(pg_temp.c('a'), 'market', 'iron', 3, 10, 'gold')::text;
reset role; update public.market_listings set expires_at = now() - interval '1 minute' where id = pg_temp.l('l2');
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*) from public.market_listings), 0::bigint, 'anúncio vencido some para os outros');
select throws_ok($$ select public.market_buy(pg_temp.c('b'), 'market', pg_temp.l('l2'), 1) $$, 'P0001', 'Este anúncio não está mais disponível.', 'anúncio vencido não vende');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select count(*) from public.market_listings where id = pg_temp.l('l2')), 1::bigint, 'o vendedor ainda vê o vencido');
select is((public.market_cancel(pg_temp.c('a'), 'market', pg_temp.l('l2')) ->> 'total')::int, 8, 'e recolhe os 3 ferros');

-- Limite de anúncios e cidade
reset role; update public.market_rules set max_listings = 1;
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select public.market_list(pg_temp.c('a'), 'market', 'iron', 1, 5, 'copper');
select throws_ok($$ select public.market_list(pg_temp.c('a'), 'market', 'iron', 1, 5, 'copper') $$, 'P0001', 'Você já tem 1 anúncios ativos.', 'respeita o limite de anúncios');
select public.start_exploration(pg_temp.c('a2'), 'cave');
select throws_ok($$ select public.market_list(pg_temp.c('a2'), 'market', 'iron', 1, 5, 'copper') $$, 'P0001', 'Volte para a cidade para usar este serviço.', 'mercado só na cidade');
reset role; update public.explorations set closed_at = now() where character_id = pg_temp.c('a2');

-- Armazém (da conta)
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into t select 'd1', public.storage_deposit(pg_temp.c('a'), 'warehouse', 'iron', 3)::text;
select is((select (v::jsonb ->> 'total')::int from t where k = 'd1'), 4, 'guardar 3 ferros tira do inventário');
select is((select (v::jsonb ->> 'stored')::int from t where k = 'd1'), 3, 'e põe no armazém');
insert into t select 'w1', public.storage_withdraw(pg_temp.c('a2'), 'warehouse', 'iron', 2)::text;
select is((select (v::jsonb ->> 'total')::int from t where k = 'w1'), 2, 'outro personagem da conta retira 2');
select is((select (v::jsonb ->> 'stored')::int from t where k = 'w1'), 1, 'sobra 1 no armazém');
select throws_ok($$ select public.storage_withdraw(pg_temp.c('a2'), 'warehouse', 'iron', 5) $$, 'P0001', 'Você não tem tudo isso no armazém.', 'não retira o que não há');
select throws_ok($$ select public.storage_deposit(pg_temp.c('a'), 'market', 'iron', 1) $$, '22023', 'Este serviço não fica aqui.', 'o armazém fica no Armazém');
reset role; update public.storage_rules set max_stacks = 1;
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select public.storage_deposit(pg_temp.c('a'), 'warehouse', 'mushroom-common', 1) $$, 'P0001',
  'O armazém está cheio (1 tipos de item). Retire algo antes.', 'respeita o limite de tipos de item');
select is((public.storage_deposit(pg_temp.c('a'), 'warehouse', 'iron', 1) ->> 'stored')::int, 2, 'o mesmo item ainda cabe');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*) from public.storage_items), 0::bigint, 'B não vê o armazém de A');

select * from finish();
rollback;
