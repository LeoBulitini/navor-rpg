-- Testes (pgTAP) da economia: lojas dos NPCs, poções e comidas, dormitório e câmbio.
-- Rodar com Supabase local:      npx supabase test db
-- Rodar sem Docker (Postgres 16): npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(31);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local');

reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select public.create_character('Aldric', 'mage');
reset role;
create temp table t (k text primary key, v text);
grant all on t to authenticated;
insert into t select 'a', id::text from public.characters where name = 'Aldric';
create function pg_temp.a() returns uuid language sql as $$ select v::uuid from t where k = 'a' $$;
grant execute on function pg_temp.a() to authenticated;

select ok(bool_and(relrowsecurity), 'RLS ativo nas tabelas da economia')
from pg_class where oid in ('public.shops'::regclass, 'public.shop_sells'::regclass, 'public.shop_buys'::regclass, 'public.economy_rules'::regclass);

reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select * from public.shop_sells $$, '42501', null, 'usuário não lê a tabela de preços direto');
select throws_ok($$ select public.inventory_add(pg_temp.a(), 'iron', 99) $$, '42501', null, 'usuário não chama a função interna de inventário');

-- Comprar
select throws_ok($$ select public.shop_buy(pg_temp.a(), 'alchemist', 'potion-health-small', 1) $$, 'P0001', 'Cobre insuficiente.', 'sem cobre não compra');
reset role; update public.characters set copper = 100 where name = 'Aldric';
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into t select 'buy', public.shop_buy(pg_temp.a(), 'alchemist', 'potion-health-small', 2)::text;
select is((select (v::jsonb ->> 'copper')::int from t where k = 'buy'), 70, 'duas poções de 15 custam 30 de cobre');
select is((select copper from public.characters where name = 'Aldric'), 70::bigint, 'o cobre gravado é o devolvido');
select is((select quantity from public.inventory_items where item_id = 'potion-health-small'), 2::bigint, 'as poções entram no inventário');
select throws_ok($$ select public.shop_buy(pg_temp.a(), 'alchemist', 'iron', 1) $$, '22023', 'Este item não está à venda aqui.', 'não compra o que o NPC não vende');
select throws_ok($$ select public.shop_buy(pg_temp.a(), 'tavern', 'potion-health-small', 1) $$, '22023', null, 'cada NPC vende só o seu catálogo');
select throws_ok($$ select public.shop_buy(pg_temp.a(), 'alchemist', 'potion-health-small', 0) $$, '22023', 'Quantidade inválida', 'quantidade zero é recusada');
select throws_ok($$ select public.shop_buy(pg_temp.a(), 'alchemist', 'potion-health-small', 100) $$, '22023', 'Quantidade inválida', 'mais de 99 de uma vez é recusado');

-- Usar
insert into t select 'use', public.use_item(pg_temp.a(), 'potion-health-small')::text;
select is((select (v::jsonb ->> 'hp')::int from t where k = 'use'), 40, 'a poção pequena devolve 40 de vida');
select is((select quantity from public.inventory_items where item_id = 'potion-health-small'), 1::bigint, 'usar gasta uma poção');
select throws_ok($$ select public.use_item(pg_temp.a(), 'bread') $$, 'P0001', 'Você não tem itens suficientes.', 'não usa item que não tem');
select throws_ok($$ select public.use_item(pg_temp.a(), 'iron') $$, '22023', 'Este item não pode ser usado.', 'minério não se usa');

-- Vender
insert into t select 'sell', public.shop_sell(pg_temp.a(), 'alchemist', 'potion-health-small', 1)::text;
select is((select (v::jsonb ->> 'earned')::int from t where k = 'sell'), 6, 'o Alquimista paga 40% do valor (15 -> 6)');
select is((select copper from public.characters where name = 'Aldric'), 76::bigint, 'o cobre da venda entra');
select ok(not exists (select 1 from public.inventory_items where item_id = 'potion-health-small'), 'vender a última unidade tira o item do inventário');
select throws_ok($$ select public.shop_sell(pg_temp.a(), 'alchemist', 'potion-health-small', 1) $$, 'P0001', 'Você não tem itens suficientes.', 'não vende o que não tem');
select throws_ok($$ select public.shop_sell(pg_temp.a(), 'tavern', 'iron', 1) $$, '22023', 'Este NPC não compra esse item.', 'a Taverna não compra minério');

-- Dormitório
select public.tavern_rest(pg_temp.a(), 'tavern');
select is((select copper from public.characters where name = 'Aldric'), 61::bigint, 'dormir na Taverna custa 15 de cobre');
select throws_ok($$ select public.tavern_rest(pg_temp.a(), 'alchemist') $$, '22023', 'Não há dormitório aqui.', 'só a Taverna tem dormitório');

-- Câmbio
select throws_ok($$ select public.exchange_currency(pg_temp.a(), 'market', 'gold', 1) $$, 'P0001', 'Cobre insuficiente.', 'precisa de 100 de cobre por moeda de ouro');
reset role; update public.characters set copper = 250 where name = 'Aldric';
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select public.exchange_currency(pg_temp.a(), 'market', 'gold', 2);
select is((select array[copper, gold] from public.characters where name = 'Aldric'), array[50, 2]::bigint[], '200 de cobre viram 2 de ouro');
select public.exchange_currency(pg_temp.a(), 'market', 'copper', 1);
select is((select array[copper, gold] from public.characters where name = 'Aldric'), array[150, 1]::bigint[], '1 de ouro vira 100 de cobre');
select throws_ok($$ select public.exchange_currency(pg_temp.a(), 'tavern', 'gold', 1) $$, '22023', 'Não há câmbio aqui.', 'câmbio só no Mercado');

-- Fora da cidade, as lojas recusam
insert into t select 'run', public.start_exploration(pg_temp.a(), 'cave')::text;
select throws_ok($$ select public.shop_buy(pg_temp.a(), 'alchemist', 'potion-health-small', 1) $$, 'P0001', 'Volte para a cidade para usar este serviço.', 'na Gruta não dá para comprar');
select end_exploration((select (v::jsonb ->> 'exploration_id')::uuid from t where k = 'run'));
select lives_ok($$ select public.shop_buy(pg_temp.a(), 'alchemist', 'potion-health-small', 1) $$, 'de volta à cidade, compra');

-- Outro usuário
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok($$ select public.shop_buy(pg_temp.a(), 'alchemist', 'potion-health-small', 1) $$, 'P0001', 'Personagem não encontrado', 'B não compra com o personagem de A');
select throws_ok($$ select public.use_item(pg_temp.a(), 'potion-health-small') $$, 'P0001', 'Personagem não encontrado', 'B não usa os itens de A');
select throws_ok($$ update public.characters set copper = 999999 $$, '42501', null, 'cliente não altera moedas direto');

select * from finish();
rollback;
