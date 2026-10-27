-- Testes (pgTAP) dos equipamentos: comprar, equipar, fabricar, melhorar, vender e ferramentas de coleta.
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
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select public.create_character('Brena', 'warrior');
reset role;
create temp table t (k text primary key, v text);
grant all on t to authenticated;
insert into t select 'a', id::text from public.characters where name = 'Aldric';
insert into t select 'b', id::text from public.characters where name = 'Brena';
create function pg_temp.a() returns uuid language sql as $$ select v::uuid from t where k = 'a' $$;
create function pg_temp.b() returns uuid language sql as $$ select v::uuid from t where k = 'b' $$;
create function pg_temp.g(p_key text) returns uuid language sql as $$ select (v::jsonb -> 'gear' ->> 'id')::uuid from t where k = p_key $$;
grant execute on function pg_temp.a() to authenticated;
grant execute on function pg_temp.b() to authenticated;
grant execute on function pg_temp.g(text) to authenticated;

select ok(bool_and(relrowsecurity), 'RLS ativo nas tabelas de equipamento')
from pg_class where oid in ('public.item_equip'::regclass, 'public.equipment_rules'::regclass, 'public.upgrade_costs'::regclass,
  'public.gather_tiers'::regclass, 'public.recipes'::regclass, 'public.recipe_materials'::regclass, 'public.character_gear'::regclass);

reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select * from public.recipes $$, '42501', null, 'usuário não lê as receitas direto');
select throws_ok($$ select public.gear_add(pg_temp.a(), 'staff-crystal') $$, '42501', null, 'usuário não cria peças pela função interna');

-- Comprar
select throws_ok($$ select public.shop_buy(pg_temp.a(), 'blacksmith', 'pickaxe-iron', 1) $$, 'P0001', 'Cobre insuficiente.', 'sem cobre não compra picareta');
reset role; update public.characters set copper = 1000 where name = 'Aldric';
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select public.shop_buy(pg_temp.a(), 'blacksmith', 'pickaxe-iron', 2) $$, '22023', 'Equipamentos são comprados um de cada vez.', 'equipamento se compra um por vez');
insert into t select 'pick', public.shop_buy(pg_temp.a(), 'blacksmith', 'pickaxe-iron', 1)::text;
select is((select (v::jsonb ->> 'copper')::int from t where k = 'pick'), 975, 'a picareta custa 25 de cobre');
select is((select count(*) from public.character_gear where item_id = 'pickaxe-iron' and slot is null and upgrade = 0), 1::bigint,
  'a picareta vira uma peça na bolsa, sem melhoria');
select throws_ok($$ select public.shop_sell(pg_temp.a(), 'blacksmith', 'pickaxe-iron', 1) $$, '22023', 'Este NPC não compra esse item.',
  'equipamento não se vende como material');

-- Ferramentas de coleta: um depósito raro (Ouro) e um comum (Ferro)
reset role;
insert into public.explorations (id, character_id, area_id, seed, expires_at)
values ('00000000-0000-0000-0000-0000000000e1', pg_temp.a(), 'cave', 1, now() + interval '30 minutes');
insert into public.exploration_nodes (exploration_id, node_index, item_id, quantity) values
  ('00000000-0000-0000-0000-0000000000e1', 0, 'gold-ore', 1),
  ('00000000-0000-0000-0000-0000000000e1', 1, 'iron', 2);
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select public.collect_node('00000000-0000-0000-0000-0000000000e1', 0) $$, 'P0001',
  'Você precisa de uma ferramenta melhor equipada para este depósito.', 'Ouro (raro) pede picareta equipada');
select is((public.collect_node('00000000-0000-0000-0000-0000000000e1', 1) ->> 'collected')::boolean, true, 'Ferro (comum) sai sem ferramenta');
insert into t select 'eq-pick', public.equip_gear(pg_temp.a(), pg_temp.g('pick'))::text;
select is((select v::jsonb -> 'gear' ->> 'slot' from t where k = 'eq-pick'), 'pickaxe', 'a picareta vai para o espaço de picareta');
reset role; update public.explorations set last_collect_at = null where id = '00000000-0000-0000-0000-0000000000e1';
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((public.collect_node('00000000-0000-0000-0000-0000000000e1', 0) ->> 'collected')::boolean, true, 'com a picareta equipada o Ouro sai');

-- Lojas e fabricação só na cidade
select throws_ok($$ select public.craft_item(pg_temp.a(), 'helmet-leather') $$, 'P0001', 'Volte para a cidade para usar este serviço.',
  'não fabrica com uma exploração aberta');
reset role; update public.explorations set closed_at = now() where id = '00000000-0000-0000-0000-0000000000e1';
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- Armas por classe
insert into t select 'sword', public.shop_buy(pg_temp.a(), 'blacksmith', 'sword-short', 1)::text;
select throws_ok($$ select public.equip_gear(pg_temp.a(), pg_temp.g('sword')) $$, 'P0001', 'Sua classe não usa esta peça.', 'Mago não equipa espada');
insert into t select 'staff', public.shop_buy(pg_temp.a(), 'blacksmith', 'staff-apprentice', 1)::text;
insert into t select 'eq-staff', public.equip_gear(pg_temp.a(), pg_temp.g('staff'))::text;
select is((select v::jsonb -> 'gear' ->> 'slot' from t where k = 'eq-staff'), 'weapon', 'Mago equipa o cajado');
reset role;
select is(public.gear_attack_bonus(pg_temp.a()), 3, 'o cajado equipado soma 3 de ataque ao teto do servidor');
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into t select 'staff2', public.shop_buy(pg_temp.a(), 'blacksmith', 'staff-apprentice', 1)::text;
insert into t select 'eq-staff2', public.equip_gear(pg_temp.a(), pg_temp.g('staff2'))::text;
select is((select (v::jsonb ->> 'unequipped')::uuid from t where k = 'eq-staff2'), pg_temp.g('staff'), 'equipar outra arma tira a anterior');
select is((select count(*) from public.character_gear where character_id = pg_temp.a() and slot = 'weapon'), 1::bigint, 'só uma arma equipada');

-- Fabricar
select throws_ok($$ select public.craft_item(pg_temp.a(), 'helmet-leather') $$, 'P0001', 'Faltam materiais para esta receita.', 'sem couro não fabrica');
select throws_ok($$ select public.craft_item(pg_temp.a(), 'nada') $$, '22023', 'Receita desconhecida.', 'receita inexistente é recusada');
reset role;
insert into public.inventory_items (character_id, item_id, quantity) values (pg_temp.a(), 'leather-simple', 10), (pg_temp.a(), 'rat-pelt', 2);
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select copper from public.characters where name = 'Aldric'), 885::bigint, 'antes: 1000 - picareta 25 - espada 30 - 2 cajados 60');
insert into t select 'helm', public.craft_item(pg_temp.a(), 'helmet-leather')::text;
select is((select copper from public.characters where name = 'Aldric'), 875::bigint, 'o capuz custa 10 de cobre');
select is((select quantity from public.inventory_items where item_id = 'leather-simple'), 8::bigint, 'e gasta 2 couros');
select is((select quantity from public.inventory_items where item_id = 'rat-pelt'), 1::bigint, 'e 1 pele de rato');

-- Melhorar
insert into t select 'up1', public.upgrade_gear(pg_temp.a(), 'blacksmith', pg_temp.g('helm'))::text;
select is((select (v::jsonb -> 'gear' ->> 'upgrade')::int from t where k = 'up1'), 1, 'a melhoria leva o capuz a +1');
select is((select (v::jsonb ->> 'copper')::int from t where k = 'up1'), 855, '+1 custa 20 de cobre');
select is((select quantity from public.inventory_items where item_id = 'leather-simple'), 7::bigint, 'e 1 couro (o material do capuz)');
select throws_ok($$ select public.upgrade_gear(pg_temp.a(), 'tavern', pg_temp.g('helm')) $$, '22023', 'Este NPC não melhora equipamentos.', 'só o Ferreiro melhora');
select throws_ok($$ select public.upgrade_gear(pg_temp.a(), 'blacksmith', pg_temp.g('pick')) $$, '22023', 'Esta peça não pode ser melhorada.', 'ferramenta não melhora');
reset role; update public.character_gear set upgrade = 5 where id = pg_temp.g('helm');
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select public.upgrade_gear(pg_temp.a(), 'blacksmith', pg_temp.g('helm')) $$, 'P0001', 'Esta peça já está no nível máximo.', 'não passa do +5');

-- Vender peça: preço de venda 8 × (1 + 0,25 × 5) = 18
insert into t select 'sold', public.sell_gear(pg_temp.a(), 'blacksmith', pg_temp.g('helm'))::text;
select is((select (v::jsonb ->> 'earned')::int from t where k = 'sold'), 18, 'o capuz +5 vale 18 de cobre no Ferreiro');
select ok(not exists (select 1 from public.character_gear where id = pg_temp.g('helm')), 'a peça vendida some');

-- Outro jogador e escrita direta
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*) from public.character_gear), 0::bigint, 'B não vê as peças de A');
select throws_ok($$ select public.equip_gear(pg_temp.a(), pg_temp.g('sword')) $$, 'P0001', 'Personagem não encontrado', 'B não equipa as peças de A');
select throws_ok($$ select public.sell_gear(pg_temp.b(), 'blacksmith', pg_temp.g('sword')) $$, 'P0001', 'Peça não encontrada', 'B não vende a peça de A');
select throws_ok($$ update public.character_gear set upgrade = 10 $$, '42501', null, 'cliente não altera peças direto');

-- Limite da bolsa
reset role; update public.equipment_rules set max_pieces = (select count(*) from public.character_gear where character_id = pg_temp.a());
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select throws_ok($$ select public.shop_buy(pg_temp.a(), 'blacksmith', 'axe-iron', 1) $$, 'P0001',
  'Sua bolsa de equipamentos está cheia. Venda alguma peça no Ferreiro.', 'bolsa cheia não recebe peça nova');

select * from finish();
rollback;
