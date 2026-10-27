-- Fase 11 (parte 6): coleta com ferramenta e teto de dano com equipamentos.

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
