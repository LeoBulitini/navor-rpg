-- Fase 11 (parte 4): comprar, vender material, fabricar e melhorar.

-- ---------------------------------------------------------------------------
-- Comprar de um NPC: equipamento vira peça (uma por vez); o resto, inventário.
-- ---------------------------------------------------------------------------
create or replace function public.shop_buy(p_character_id uuid, p_shop_id text, p_item_id text, p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char  public.characters;
  v_offer public.shop_sells;
  v_cost  bigint;
  v_total bigint := 0;
  v_gear  public.character_gear;
  v_is_gear boolean;
begin
  v_char := public.town_character(p_character_id);
  if p_quantity is null or p_quantity < 1 or p_quantity > 99 then
    raise exception 'Quantidade inválida' using errcode = '22023';
  end if;
  select s.* into v_offer from public.shop_sells s where s.shop_id = p_shop_id and s.item_id = p_item_id;
  if not found then
    raise exception 'Este item não está à venda aqui.' using errcode = '22023';
  end if;
  v_is_gear := exists (select 1 from public.item_equip e where e.item_id = p_item_id);
  if v_is_gear and p_quantity <> 1 then
    raise exception 'Equipamentos são comprados um de cada vez.' using errcode = '22023';
  end if;
  v_cost := v_offer.price::bigint * p_quantity;
  if v_offer.currency = 'copper' and v_char.copper < v_cost then
    raise exception 'Cobre insuficiente.' using errcode = 'P0001';
  end if;
  if v_offer.currency = 'gold' and v_char.gold < v_cost then
    raise exception 'Ouro insuficiente.' using errcode = 'P0001';
  end if;
  update public.characters c
  set copper = c.copper - case when v_offer.currency = 'copper' then v_cost else 0 end,
      gold = c.gold - case when v_offer.currency = 'gold' then v_cost else 0 end,
      updated_at = now()
  where c.id = v_char.id
  returning c.* into v_char;
  if v_is_gear then
    v_gear := public.gear_add(v_char.id, p_item_id);
    return jsonb_build_object('item_id', p_item_id, 'total', 0, 'gear', public.gear_json(v_gear), 'copper', v_char.copper, 'gold', v_char.gold);
  end if;
  v_total := public.inventory_add(v_char.id, p_item_id, p_quantity);
  return jsonb_build_object('item_id', p_item_id, 'total', v_total, 'copper', v_char.copper, 'gold', v_char.gold);
end;
$$;

-- Vender material para um NPC (equipamento vende por sell_gear).
create or replace function public.shop_sell(p_character_id uuid, p_shop_id text, p_item_id text, p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char  public.characters;
  v_value integer;
  v_rate  numeric;
  v_gain  bigint;
  v_total bigint;
begin
  v_char := public.town_character(p_character_id);
  if p_quantity is null or p_quantity < 1 or p_quantity > 999 then
    raise exception 'Quantidade inválida' using errcode = '22023';
  end if;
  if not exists (select 1 from public.shop_buys b where b.shop_id = p_shop_id and b.item_id = p_item_id)
     or exists (select 1 from public.item_equip e where e.item_id = p_item_id) then
    raise exception 'Este NPC não compra esse item.' using errcode = '22023';
  end if;
  -- Mesma regra de sellPrice (packages/shared/src/economy/shop.ts).
  select i.value into v_value from public.items i where i.id = p_item_id;
  select r.sell_rate into v_rate from public.economy_rules r where r.id = 1;
  v_gain := greatest(1, floor(v_value * v_rate))::bigint * p_quantity;
  v_total := public.inventory_add(v_char.id, p_item_id, -p_quantity);
  update public.characters c set copper = c.copper + v_gain, updated_at = now()
  where c.id = v_char.id returning c.* into v_char;
  return jsonb_build_object('item_id', p_item_id, 'total', v_total, 'earned', v_gain, 'copper', v_char.copper, 'gold', v_char.gold);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fabricar: gasta materiais e moedas da receita e cria a peça (ou o item).
-- ---------------------------------------------------------------------------
create or replace function public.craft_item(p_character_id uuid, p_recipe_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char      public.characters;
  v_recipe    public.recipes;
  v_mat       record;
  v_have      bigint;
  v_materials jsonb := '[]'::jsonb;
  v_gear      public.character_gear;
  v_total     bigint := 0;
begin
  v_char := public.town_character(p_character_id);
  select r.* into v_recipe from public.recipes r where r.id = p_recipe_id;
  if v_recipe.id is null then
    raise exception 'Receita desconhecida.' using errcode = '22023';
  end if;
  if v_char.copper < v_recipe.copper then
    raise exception 'Cobre insuficiente.' using errcode = 'P0001';
  end if;
  if v_char.gold < v_recipe.gold then
    raise exception 'Ouro insuficiente.' using errcode = 'P0001';
  end if;
  for v_mat in select m.* from public.recipe_materials m where m.recipe_id = p_recipe_id order by m.item_id loop
    select coalesce(sum(i.quantity), 0) into v_have from public.inventory_items i
    where i.character_id = v_char.id and i.item_id = v_mat.item_id;
    if v_have < v_mat.quantity then
      raise exception 'Faltam materiais para esta receita.' using errcode = 'P0001';
    end if;
  end loop;
  for v_mat in select m.* from public.recipe_materials m where m.recipe_id = p_recipe_id order by m.item_id loop
    v_materials := v_materials || jsonb_build_object('item_id', v_mat.item_id, 'total', public.inventory_add(v_char.id, v_mat.item_id, -v_mat.quantity));
  end loop;
  update public.characters c set copper = c.copper - v_recipe.copper, gold = c.gold - v_recipe.gold, updated_at = now()
  where c.id = v_char.id returning c.* into v_char;
  if exists (select 1 from public.item_equip e where e.item_id = v_recipe.item_id) then
    v_gear := public.gear_add(v_char.id, v_recipe.item_id);
    return jsonb_build_object('item_id', v_recipe.item_id, 'gear', public.gear_json(v_gear), 'total', 0,
      'materials', v_materials, 'copper', v_char.copper, 'gold', v_char.gold);
  end if;
  v_total := public.inventory_add(v_char.id, v_recipe.item_id, 1);
  return jsonb_build_object('item_id', v_recipe.item_id, 'total', v_total, 'materials', v_materials, 'copper', v_char.copper, 'gold', v_char.gold);
end;
$$;

-- ---------------------------------------------------------------------------
-- Melhorar uma peça (+1). Sempre dá certo quando o jogador tem o que a tabela pede.
-- ---------------------------------------------------------------------------
create or replace function public.upgrade_gear(p_character_id uuid, p_shop_id text, p_gear_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char  public.characters;
  v_gear  public.character_gear;
  v_equip public.item_equip;
  v_cost  public.upgrade_costs;
  v_total bigint;
begin
  v_char := public.town_character(p_character_id);
  if not exists (select 1 from public.shops s where s.id = p_shop_id and s.upgrades) then
    raise exception 'Este NPC não melhora equipamentos.' using errcode = '22023';
  end if;
  v_gear := public.owned_gear(v_char.id, p_gear_id);
  select e.* into v_equip from public.item_equip e where e.item_id = v_gear.item_id;
  if v_equip.upgrade_item_id is null then
    raise exception 'Esta peça não pode ser melhorada.' using errcode = '22023';
  end if;
  select u.* into v_cost from public.upgrade_costs u where u.level = v_gear.upgrade + 1;
  if v_cost.level is null then
    raise exception 'Esta peça já está no nível máximo.' using errcode = 'P0001';
  end if;
  if v_char.copper < v_cost.copper then
    raise exception 'Cobre insuficiente.' using errcode = 'P0001';
  end if;
  if v_char.gold < v_cost.gold then
    raise exception 'Ouro insuficiente.' using errcode = 'P0001';
  end if;
  if coalesce((select i.quantity from public.inventory_items i where i.character_id = v_char.id and i.item_id = v_equip.upgrade_item_id), 0) < v_cost.materials then
    raise exception 'Faltam materiais para a melhoria.' using errcode = 'P0001';
  end if;
  v_total := public.inventory_add(v_char.id, v_equip.upgrade_item_id, -v_cost.materials);
  update public.characters c set copper = c.copper - v_cost.copper, gold = c.gold - v_cost.gold, updated_at = now()
  where c.id = v_char.id returning c.* into v_char;
  update public.character_gear g set upgrade = g.upgrade + 1 where g.id = v_gear.id returning g.* into v_gear;
  return jsonb_build_object('gear', public.gear_json(v_gear), 'material', jsonb_build_object('item_id', v_equip.upgrade_item_id, 'total', v_total),
    'copper', v_char.copper, 'gold', v_char.gold);
end;
$$;

revoke all on function public.craft_item(uuid, text) from public, anon;
revoke all on function public.upgrade_gear(uuid, text, uuid) from public, anon;
grant execute on function public.craft_item(uuid, text) to authenticated;
grant execute on function public.upgrade_gear(uuid, text, uuid) to authenticated;
