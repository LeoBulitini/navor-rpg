-- Fase 11 (parte 3): funções internas das peças.

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
