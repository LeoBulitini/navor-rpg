-- Fase 11: equipamentos, Ferreiro (comprar, fabricar, melhorar e vender peças) e ferramentas de coleta.
-- Cada peça é uma linha de character_gear (não empilha) com nível de melhoria próprio. O cliente só lê as
-- próprias peças; comprar, fabricar, melhorar, vender, equipar e tirar passam por funções que conferem
-- dono, saldo, materiais e regras. Depósitos raros pedem picareta ou machado equipado (collect_node) e o
-- teto de dano por segundo dos abates soma o ataque dos equipamentos (kill_monster).
-- Catálogos (peças, receitas, custos de melhoria) vêm de content/ pela content_sync.

alter table public.items add column gather_tool text;
alter table public.shops add column upgrades boolean not null default false;
alter table public.combat_rules add column max_dps_per_attack numeric not null default 0 check (max_dps_per_attack >= 0);

-- O que faz de um item um equipamento (content/items.json -> equip).
create table public.item_equip (
  item_id          text primary key references public.items (id) on delete cascade,
  slot             text not null,
  paths            text[],
  tool_tier        integer check (tool_tier >= 1),
  upgrade_item_id  text references public.items (id),
  hp               integer not null default 0 check (hp >= 0),
  mana             integer not null default 0 check (mana >= 0),
  phys_attack      integer not null default 0 check (phys_attack >= 0),
  mag_attack       integer not null default 0 check (mag_attack >= 0),
  phys_defense     integer not null default 0 check (phys_defense >= 0),
  mag_defense      integer not null default 0 check (mag_defense >= 0),
  precision_bonus  integer not null default 0 check (precision_bonus >= 0)
);

-- Uma linha só: regras de melhoria e limite de peças (content/equipment.json).
create table public.equipment_rules (
  id                      integer primary key check (id = 1),
  stat_percent_per_level  integer not null check (stat_percent_per_level > 0),
  max_pieces              integer not null check (max_pieces > 0),
  sell_bonus_per_upgrade  numeric not null check (sell_bonus_per_upgrade >= 0)
);

-- Custo para chegar a cada nível de melhoria; o maior nível da tabela é o máximo.
create table public.upgrade_costs (
  level     integer primary key check (level >= 1),
  copper    integer not null check (copper >= 0),
  gold      integer not null check (gold >= 0),
  materials integer not null check (materials >= 1)
);

-- Nível de ferramenta que cada raridade de depósito pede.
create table public.gather_tiers (
  rarity text primary key,
  tier   integer not null check (tier >= 1)
);

create table public.recipes (
  id      text primary key,
  shop_id text not null references public.shops (id) on delete cascade,
  item_id text not null references public.items (id),
  copper  integer not null default 0 check (copper >= 0),
  gold    integer not null default 0 check (gold >= 0)
);

create table public.recipe_materials (
  recipe_id text not null references public.recipes (id) on delete cascade,
  item_id   text not null references public.items (id),
  quantity  integer not null check (quantity >= 1),
  primary key (recipe_id, item_id)
);

alter table public.item_equip enable row level security;
alter table public.equipment_rules enable row level security;
alter table public.upgrade_costs enable row level security;
alter table public.gather_tiers enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_materials enable row level security;
revoke all on public.item_equip, public.equipment_rules, public.upgrade_costs, public.gather_tiers,
  public.recipes, public.recipe_materials from anon, authenticated;

-- Peças dos personagens. slot preenchido = equipada naquele espaço (uma por espaço).
create table public.character_gear (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  item_id      text not null references public.items (id),
  upgrade      integer not null default 0 check (upgrade >= 0),
  slot         text,
  created_at   timestamptz not null default now()
);
create index character_gear_character on public.character_gear (character_id);
create unique index character_gear_slot on public.character_gear (character_id, slot) where slot is not null;

alter table public.character_gear enable row level security;
revoke all on public.character_gear from anon, authenticated;
grant select on public.character_gear to authenticated;
create policy "character_gear: dono lê as peças dos próprios personagens"
  on public.character_gear for select
  to authenticated
  using (exists (
    select 1 from public.characters c
    where c.id = character_id and c.user_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Funções internas (o cliente não chama)
-- ---------------------------------------------------------------------------

-- Atributo melhorado: base + ceil(base × % × nível / 100). Mesma regra de upgradedStat (economy/gear.ts).
create or replace function public.gear_stat(p_base integer, p_upgrade integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_base <= 0 or p_upgrade <= 0 then p_base
    else p_base + ceil((p_base * r.stat_percent_per_level * p_upgrade)::numeric / 100)::integer end
  from public.equipment_rules r where r.id = 1;
$$;
revoke all on function public.gear_stat(integer, integer) from public, anon, authenticated;

-- Soma, nas peças equipadas, do maior entre ataque físico e mágico. Mesma regra de gearAttackBonus.
create or replace function public.gear_attack_bonus(p_character_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(greatest(public.gear_stat(e.phys_attack, g.upgrade), public.gear_stat(e.mag_attack, g.upgrade))), 0)::integer
  from public.character_gear g join public.item_equip e on e.item_id = g.item_id
  where g.character_id = p_character_id and g.slot is not null;
$$;
revoke all on function public.gear_attack_bonus(uuid) from public, anon, authenticated;

-- Cria uma peça na bolsa do personagem, respeitando o limite.
create or replace function public.gear_add(p_character_id uuid, p_item_id text)
returns public.character_gear
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max  integer;
  v_gear public.character_gear;
begin
  select r.max_pieces into v_max from public.equipment_rules r where r.id = 1;
  if (select count(*) from public.character_gear g where g.character_id = p_character_id) >= v_max then
    raise exception 'Sua bolsa de equipamentos está cheia. Venda alguma peça no Ferreiro.' using errcode = 'P0001';
  end if;
  insert into public.character_gear (character_id, item_id) values (p_character_id, p_item_id) returning * into v_gear;
  return v_gear;
end;
$$;
revoke all on function public.gear_add(uuid, text) from public, anon, authenticated;

create or replace function public.gear_json(p_gear public.character_gear)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('id', p_gear.id, 'item_id', p_gear.item_id, 'upgrade', p_gear.upgrade, 'slot', p_gear.slot);
$$;
revoke all on function public.gear_json(public.character_gear) from public, anon, authenticated;

-- Peça do usuário, travada para a transação.
create or replace function public.owned_gear(p_character_id uuid, p_gear_id uuid)
returns public.character_gear
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gear public.character_gear;
begin
  select g.* into v_gear from public.character_gear g
  where g.id = p_gear_id and g.character_id = p_character_id for update;
  if v_gear.id is null then
    raise exception 'Peça não encontrada' using errcode = 'P0001';
  end if;
  return v_gear;
end;
$$;
revoke all on function public.owned_gear(uuid, uuid) from public, anon, authenticated;

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

-- ---------------------------------------------------------------------------
-- Vender uma peça ao NPC. Mesma regra de gearSellPrice.
-- ---------------------------------------------------------------------------
create or replace function public.sell_gear(p_character_id uuid, p_shop_id text, p_gear_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char  public.characters;
  v_gear  public.character_gear;
  v_value integer;
  v_rate  numeric;
  v_bonus numeric;
  v_gain  bigint;
begin
  v_char := public.town_character(p_character_id);
  v_gear := public.owned_gear(v_char.id, p_gear_id);
  if not exists (select 1 from public.shop_buys b where b.shop_id = p_shop_id and b.item_id = v_gear.item_id) then
    raise exception 'Este NPC não compra esse item.' using errcode = '22023';
  end if;
  select i.value into v_value from public.items i where i.id = v_gear.item_id;
  select r.sell_rate into v_rate from public.economy_rules r where r.id = 1;
  select r.sell_bonus_per_upgrade into v_bonus from public.equipment_rules r where r.id = 1;
  v_gain := floor(greatest(1, floor(v_value * v_rate)) * (1 + v_bonus * v_gear.upgrade))::bigint;
  delete from public.character_gear g where g.id = v_gear.id;
  update public.characters c set copper = c.copper + v_gain, updated_at = now()
  where c.id = v_char.id returning c.* into v_char;
  return jsonb_build_object('gear_id', v_gear.id, 'earned', v_gain, 'copper', v_char.copper, 'gold', v_char.gold);
end;
$$;

-- ---------------------------------------------------------------------------
-- Equipar e tirar (em qualquer lugar). Equipar troca a peça que estava no espaço.
-- ---------------------------------------------------------------------------
create or replace function public.equip_gear(p_character_id uuid, p_gear_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path  text;
  v_gear  public.character_gear;
  v_equip public.item_equip;
  v_old   uuid;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  select k.path_id into v_path from public.characters c join public.classes k on k.id = c.class_id
  where c.id = p_character_id and c.user_id = auth.uid();
  if v_path is null then
    raise exception 'Personagem não encontrado' using errcode = 'P0001';
  end if;
  v_gear := public.owned_gear(p_character_id, p_gear_id);
  select e.* into v_equip from public.item_equip e where e.item_id = v_gear.item_id;
  if v_equip.paths is not null and not (v_path = any (v_equip.paths)) then
    raise exception 'Sua classe não usa esta peça.' using errcode = 'P0001';
  end if;
  update public.character_gear g set slot = null
  where g.character_id = p_character_id and g.slot = v_equip.slot and g.id <> v_gear.id
  returning g.id into v_old;
  update public.character_gear g set slot = v_equip.slot where g.id = v_gear.id returning g.* into v_gear;
  return jsonb_build_object('gear', public.gear_json(v_gear), 'unequipped', v_old);
end;
$$;

create or replace function public.unequip_gear(p_character_id uuid, p_gear_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gear public.character_gear;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  if not exists (select 1 from public.characters c where c.id = p_character_id and c.user_id = auth.uid()) then
    raise exception 'Personagem não encontrado' using errcode = 'P0001';
  end if;
  v_gear := public.owned_gear(p_character_id, p_gear_id);
  update public.character_gear g set slot = null where g.id = v_gear.id returning g.* into v_gear;
  return jsonb_build_object('gear', public.gear_json(v_gear));
end;
$$;

-- ---------------------------------------------------------------------------
-- Coleta: depósito raro pede a ferramenta certa equipada (mesma regra de gatherBlock).
-- ---------------------------------------------------------------------------
create or replace function public.collect_node(p_exploration_id uuid, p_node_index integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_exp      public.explorations;
  v_owner    uuid;
  v_cooldown integer;
  v_node     public.exploration_nodes;
  v_total    bigint;
  v_tool     text;
  v_need     integer;
  v_has      integer;
begin
  if v_user is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;

  -- A trava na exploração faz as coletas dela acontecerem uma de cada vez.
  select e.* into v_exp from public.explorations e where e.id = p_exploration_id for update;
  select c.user_id into v_owner from public.characters c where c.id = v_exp.character_id;
  if v_exp.id is null or v_owner is distinct from v_user then
    raise exception 'Exploração não encontrada' using errcode = 'P0001';
  end if;

  select n.* into v_node from public.exploration_nodes n
  where n.exploration_id = p_exploration_id and n.node_index = p_node_index;
  if not found then
    raise exception 'Ponto de coleta inválido' using errcode = '22023';
  end if;

  if v_node.collected_at is not null then
    select i.quantity into v_total from public.inventory_items i
    where i.character_id = v_exp.character_id and i.item_id = v_node.item_id;
    return jsonb_build_object('item_id', v_node.item_id, 'quantity', v_node.quantity, 'collected', false, 'total', coalesce(v_total, 0));
  end if;

  if v_exp.closed_at is not null or v_exp.expires_at <= now() then
    raise exception 'Esta exploração terminou. Entre na área de novo.' using errcode = 'P0001';
  end if;

  select i.gather_tool, t.tier into v_tool, v_need
  from public.items i left join public.gather_tiers t on t.rarity = i.rarity
  where i.id = v_node.item_id;
  if v_tool is not null and v_need is not null then
    select coalesce(max(e.tool_tier), 0) into v_has
    from public.character_gear g join public.item_equip e on e.item_id = g.item_id
    where g.character_id = v_exp.character_id and g.slot = v_tool;
    if v_has < v_need then
      raise exception 'Você precisa de uma ferramenta melhor equipada para este depósito.' using errcode = 'P0001';
    end if;
  end if;

  select a.collect_cooldown_ms into v_cooldown from public.exploration_areas a where a.id = v_exp.area_id;
  if v_exp.last_collect_at is not null
     and clock_timestamp() < v_exp.last_collect_at + make_interval(secs => v_cooldown / 1000.0) then
    raise exception 'Aguarde um instante para coletar de novo.' using errcode = 'P0001';
  end if;

  update public.exploration_nodes n set collected_at = clock_timestamp()
  where n.exploration_id = p_exploration_id and n.node_index = p_node_index;
  update public.explorations e set last_collect_at = clock_timestamp() where e.id = p_exploration_id;

  v_total := public.inventory_add(v_exp.character_id, v_node.item_id, v_node.quantity);
  return jsonb_build_object('item_id', v_node.item_id, 'quantity', v_node.quantity, 'collected', true, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- Abate: o teto de dano por segundo soma o ataque dos equipamentos.
-- ---------------------------------------------------------------------------
create or replace function public.kill_monster(p_exploration_id uuid, p_monster_index integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_exp      public.explorations;
  v_char     public.characters;
  v_monster  public.exploration_monsters;
  v_creature public.creatures;
  v_hp_done  bigint;
  v_cap      numeric;
  v_elapsed  numeric;
  v_level    integer;
  v_copper   integer;
  v_qty      integer;
  v_total    bigint;
  v_drop     record;
  v_drops    jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;

  select e.* into v_exp from public.explorations e where e.id = p_exploration_id for update;
  select c.* into v_char from public.characters c where c.id = v_exp.character_id for update;
  if v_exp.id is null or v_char.user_id is distinct from v_user then
    raise exception 'Exploração não encontrada' using errcode = 'P0001';
  end if;

  select m.* into v_monster from public.exploration_monsters m
  where m.exploration_id = p_exploration_id and m.monster_index = p_monster_index;
  if not found then
    raise exception 'Monstro inválido' using errcode = '22023';
  end if;

  -- Abate repetido (recarregar, reconectar): não dá nada de novo.
  if v_monster.killed_at is not null then
    return jsonb_build_object('killed', false, 'creature_id', v_monster.creature_id, 'xp_gained', 0,
      'xp', v_char.xp, 'level', v_char.level, 'leveled_up', false, 'copper_gained', 0, 'copper', v_char.copper, 'drops', '[]'::jsonb);
  end if;

  if v_exp.closed_at is not null or v_exp.expires_at <= now() then
    raise exception 'Esta exploração terminou. Entre na área de novo.' using errcode = 'P0001';
  end if;

  -- Plausibilidade: a vida somada dos monstros abatidos não pode passar do teto de dano por
  -- segundo (nível e equipamentos) vezes o tempo desde a entrada. Mesma regra de serverMaxDps.
  select * into v_creature from public.creatures c where c.id = v_monster.creature_id;
  select coalesce(sum(c.hp), 0) into v_hp_done
  from public.exploration_monsters m join public.creatures c on c.id = m.creature_id
  where m.exploration_id = p_exploration_id and m.killed_at is not null;
  select r.max_dps_base + r.max_dps_per_level * v_char.level + r.max_dps_per_attack * public.gear_attack_bonus(v_char.id)
  into v_cap from public.combat_rules r where r.id = 1;
  v_elapsed := extract(epoch from clock_timestamp() - v_exp.started_at);
  if v_cap is null or v_hp_done + v_creature.hp > v_cap * v_elapsed then
    raise exception 'Abate rápido demais para ser válido.' using errcode = 'P0001';
  end if;

  update public.exploration_monsters m set killed_at = clock_timestamp()
  where m.exploration_id = p_exploration_id and m.monster_index = p_monster_index;

  -- XP, nível (pela tabela) e cobre. Mesma regra de rollKillRewards (procgen/creatures.ts).
  v_copper := v_creature.copper_min + floor(random() * (v_creature.copper_max - v_creature.copper_min + 1))::integer;
  select coalesce(max(t.level), 0) into v_level from public.level_thresholds t where t.total_xp <= v_char.xp + v_creature.xp;
  update public.characters c
  set xp = c.xp + v_creature.xp,
      level = greatest(c.level, v_level),
      copper = c.copper + v_copper,
      updated_at = now()
  where c.id = v_char.id;

  for v_drop in select d.* from public.creature_drops d where d.creature_id = v_creature.id order by d.item_id loop
    if random() < v_drop.chance then
      v_qty := v_drop.qty_min + floor(random() * (v_drop.qty_max - v_drop.qty_min + 1))::integer;
      v_total := public.inventory_add(v_char.id, v_drop.item_id, v_qty);
      v_drops := v_drops || jsonb_build_object('item_id', v_drop.item_id, 'quantity', v_qty, 'total', v_total);
    end if;
  end loop;

  return jsonb_build_object('killed', true, 'creature_id', v_creature.id, 'xp_gained', v_creature.xp,
    'xp', v_char.xp + v_creature.xp, 'level', greatest(v_char.level, v_level), 'leveled_up', v_level > v_char.level,
    'copper_gained', v_copper, 'copper', v_char.copper + v_copper, 'drops', v_drops);
end;
$$;

revoke all on function public.craft_item(uuid, text) from public, anon;
revoke all on function public.upgrade_gear(uuid, text, uuid) from public, anon;
revoke all on function public.sell_gear(uuid, text, uuid) from public, anon;
revoke all on function public.equip_gear(uuid, uuid) from public, anon;
revoke all on function public.unequip_gear(uuid, uuid) from public, anon;
grant execute on function public.craft_item(uuid, text) to authenticated;
grant execute on function public.upgrade_gear(uuid, text, uuid) to authenticated;
grant execute on function public.sell_gear(uuid, text, uuid) to authenticated;
grant execute on function public.equip_gear(uuid, uuid) to authenticated;
grant execute on function public.unequip_gear(uuid, uuid) to authenticated;
