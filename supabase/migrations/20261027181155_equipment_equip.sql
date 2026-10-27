-- Fase 11 (parte 5): equipar e tirar.

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

revoke all on function public.equip_gear(uuid, uuid) from public, anon;
revoke all on function public.unequip_gear(uuid, uuid) from public, anon;
grant execute on function public.equip_gear(uuid, uuid) to authenticated;
grant execute on function public.unequip_gear(uuid, uuid) to authenticated;
