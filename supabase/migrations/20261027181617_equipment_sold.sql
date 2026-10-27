-- Fase 11 (parte 7): vender uma peça ao Ferreiro. A peça vendida fica marcada (sold_at) em vez de ser
-- apagada: sai da bolsa, do limite de peças e da leitura do cliente, e fica como histórico da venda.

alter table public.character_gear add column sold_at timestamptz;

alter policy "character_gear: dono lê as peças dos próprios personagens"
  on public.character_gear
  using (sold_at is null and exists (
    select 1 from public.characters c
    where c.id = character_id and c.user_id = (select auth.uid())
  ));

-- Cria uma peça na bolsa do personagem, respeitando o limite (só conta as peças não vendidas).
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
  if (select count(*) from public.character_gear g where g.character_id = p_character_id and g.sold_at is null) >= v_max then
    raise exception 'Sua bolsa de equipamentos está cheia. Venda alguma peça no Ferreiro.' using errcode = 'P0001';
  end if;
  insert into public.character_gear (character_id, item_id) values (p_character_id, p_item_id) returning * into v_gear;
  return v_gear;
end;
$$;
revoke all on function public.gear_add(uuid, text) from public, anon, authenticated;

-- Peça do usuário (não vendida), travada para a transação.
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
  where g.id = p_gear_id and g.character_id = p_character_id and g.sold_at is null for update;
  if v_gear.id is null then
    raise exception 'Peça não encontrada' using errcode = 'P0001';
  end if;
  return v_gear;
end;
$$;
revoke all on function public.owned_gear(uuid, uuid) from public, anon, authenticated;

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
  update public.character_gear g set slot = null, sold_at = now() where g.id = v_gear.id;
  update public.characters c set copper = c.copper + v_gain, updated_at = now()
  where c.id = v_char.id returning c.* into v_char;
  return jsonb_build_object('gear_id', v_gear.id, 'earned', v_gain, 'copper', v_char.copper, 'gold', v_char.gold);
end;
$$;

revoke all on function public.sell_gear(uuid, text, uuid) from public, anon;
grant execute on function public.sell_gear(uuid, text, uuid) to authenticated;
