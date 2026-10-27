-- Fase 9: Floresta, animais, Morcego, Esqueleto Antigo e baús.
-- A Floresta usa as mesmas tabelas e funções da Gruta (os dados vêm de content/ pela content_sync).
-- Baús: start_exploration decide quantos há em cada entrada; open_chest confere dono, prazo e um tempo
-- mínimo desde a entrada, e só então sorteia cobre, itens e, raramente, 1 moeda de ouro.
-- As mensagens de "exploração terminou" deixam de citar a Gruta (agora há outras áreas).

-- ---------------------------------------------------------------------------
-- Catálogo dos baús (cópia de content/procedural.json; só o servidor lê)
-- ---------------------------------------------------------------------------
create table public.area_chest_rules (
  area_id     text primary key references public.exploration_areas (id) on delete cascade,
  chests_min  integer not null check (chests_min >= 0),
  chests_max  integer not null,
  copper_min  integer not null check (copper_min >= 0),
  copper_max  integer not null,
  gold_chance numeric not null check (gold_chance >= 0 and gold_chance <= 1),
  min_seconds integer not null check (min_seconds >= 0),
  check (chests_min <= chests_max),
  check (copper_min <= copper_max)
);

create table public.area_chest_items (
  area_id text not null references public.area_chest_rules (area_id) on delete cascade,
  item_id text not null references public.items (id),
  chance  numeric not null check (chance > 0 and chance <= 1),
  qty_min integer not null check (qty_min >= 1),
  qty_max integer not null,
  primary key (area_id, item_id),
  check (qty_min <= qty_max)
);

create table public.exploration_chests (
  exploration_id uuid not null references public.explorations (id) on delete cascade,
  chest_index    integer not null check (chest_index >= 0),
  opened_at      timestamptz,
  primary key (exploration_id, chest_index)
);

alter table public.area_chest_rules enable row level security;
alter table public.area_chest_items enable row level security;
alter table public.exploration_chests enable row level security;
revoke all on public.area_chest_rules, public.area_chest_items, public.exploration_chests from anon, authenticated;

-- ---------------------------------------------------------------------------
-- start_exploration: agora também decide quantos baús a entrada tem
-- ---------------------------------------------------------------------------
create or replace function public.start_exploration(p_character_id uuid, p_area_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_area     public.exploration_areas;
  v_id       uuid;
  v_seed     bigint;
  v_count    integer;
  v_total    integer;
  v_pick     double precision;
  v_rule     record;
  v_item     text;
  v_creature text;
  v_chests   public.area_chest_rules;
begin
  if v_user is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  if not exists (select 1 from public.characters c where c.id = p_character_id and c.user_id = v_user) then
    raise exception 'Personagem não encontrado' using errcode = 'P0001';
  end if;
  select * into v_area from public.exploration_areas a where a.id = p_area_id;
  if not found then
    raise exception 'Área desconhecida: %', p_area_id using errcode = '22023';
  end if;

  -- Uma entrada por vez para o mesmo personagem.
  perform pg_advisory_xact_lock(hashtextextended(p_character_id::text, 1));
  select count(*) into v_count from public.explorations e
  where e.character_id = p_character_id and e.started_at > now() - interval '1 minute';
  if v_count >= v_area.max_starts_per_minute then
    raise exception 'Muitas entradas seguidas. Aguarde um minuto.' using errcode = 'P0001';
  end if;

  -- Entrar de novo encerra a exploração anterior; o que sobrou nela se perde.
  update public.explorations e set closed_at = now()
  where e.character_id = p_character_id and e.closed_at is null;

  v_seed := floor(random() * 4294967296)::bigint;
  insert into public.explorations (character_id, area_id, seed, expires_at)
  values (p_character_id, p_area_id, v_seed, now() + make_interval(mins => v_area.expires_minutes))
  returning id into v_id;

  -- Pontos de coleta. Mesma regra de rollResourceNodes (packages/shared/src/procgen/resources.ts).
  select sum(r.weight) into v_total from public.area_rarity_rules r where r.area_id = p_area_id;
  v_count := v_area.nodes_min + floor(random() * (v_area.nodes_max - v_area.nodes_min + 1))::integer;
  for i in 0 .. v_count - 1 loop
    v_pick := random() * v_total;
    select x.rarity, x.qty_min, x.qty_max into v_rule
    from (
      select r.rarity, r.qty_min, r.qty_max, sum(r.weight) over (order by r.rarity) as upto
      from public.area_rarity_rules r where r.area_id = p_area_id
    ) x
    where x.upto > v_pick
    order by x.upto
    limit 1;

    select ai.item_id into v_item
    from public.area_items ai join public.items it on it.id = ai.item_id
    where ai.area_id = p_area_id and it.rarity = v_rule.rarity
    order by random()
    limit 1;

    insert into public.exploration_nodes (exploration_id, node_index, item_id, quantity)
    values (v_id, i, v_item, v_rule.qty_min + floor(random() * (v_rule.qty_max - v_rule.qty_min + 1))::integer);
  end loop;

  -- Monstros. Mesma regra de rollMonsters (packages/shared/src/procgen/creatures.ts).
  select sum(ac.weight) into v_total from public.area_creatures ac where ac.area_id = p_area_id;
  if v_total is not null then
    v_count := v_area.monsters_min + floor(random() * (v_area.monsters_max - v_area.monsters_min + 1))::integer;
    for i in 0 .. v_count - 1 loop
      v_pick := random() * v_total;
      select x.creature_id into v_creature
      from (
        select ac.creature_id, sum(ac.weight) over (order by ac.creature_id) as upto
        from public.area_creatures ac where ac.area_id = p_area_id
      ) x
      where x.upto > v_pick
      order by x.upto
      limit 1;
      insert into public.exploration_monsters (exploration_id, monster_index, creature_id) values (v_id, i, v_creature);
    end loop;
  end if;

  -- Baús: o servidor só decide quantos há; o conteúdo é sorteado ao abrir (open_chest).
  select * into v_chests from public.area_chest_rules r where r.area_id = p_area_id;
  if found then
    v_count := v_chests.chests_min + floor(random() * (v_chests.chests_max - v_chests.chests_min + 1))::integer;
    insert into public.exploration_chests (exploration_id, chest_index)
    select v_id, i from generate_series(0, v_count - 1) i;
  end if;

  return jsonb_build_object(
    'exploration_id', v_id,
    'chests', (select count(*) from public.exploration_chests ch where ch.exploration_id = v_id),
    'seed', v_seed,
    'nodes', coalesce((
      select jsonb_agg(jsonb_build_object('index', n.node_index, 'item_id', n.item_id, 'quantity', n.quantity) order by n.node_index)
      from public.exploration_nodes n where n.exploration_id = v_id
    ), '[]'::jsonb),
    'monsters', coalesce((
      select jsonb_agg(jsonb_build_object('index', m.monster_index, 'creature_id', m.creature_id) order by m.monster_index)
      from public.exploration_monsters m where m.exploration_id = v_id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- open_chest: abre um baú uma vez só e sorteia o conteúdo
-- ---------------------------------------------------------------------------
create or replace function public.open_chest(p_exploration_id uuid, p_chest_index integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_exp    public.explorations;
  v_char   public.characters;
  v_chest  public.exploration_chests;
  v_rules  public.area_chest_rules;
  v_copper integer;
  v_gold   integer := 0;
  v_qty    integer;
  v_total  bigint;
  v_item   record;
  v_drops  jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;

  select e.* into v_exp from public.explorations e where e.id = p_exploration_id for update;
  select c.* into v_char from public.characters c where c.id = v_exp.character_id for update;
  if v_exp.id is null or v_char.user_id is distinct from v_user then
    raise exception 'Exploração não encontrada' using errcode = 'P0001';
  end if;

  select ch.* into v_chest from public.exploration_chests ch
  where ch.exploration_id = p_exploration_id and ch.chest_index = p_chest_index;
  if not found then
    raise exception 'Baú inválido' using errcode = '22023';
  end if;

  -- Abrir de novo (recarregar, reconectar): não dá nada de novo.
  if v_chest.opened_at is not null then
    return jsonb_build_object('opened', false, 'copper_gained', 0, 'copper', v_char.copper,
      'gold_gained', 0, 'gold', v_char.gold, 'drops', '[]'::jsonb);
  end if;

  if v_exp.closed_at is not null or v_exp.expires_at <= now() then
    raise exception 'Esta exploração terminou. Entre na área de novo.' using errcode = 'P0001';
  end if;
  select r.* into v_rules from public.area_chest_rules r where r.area_id = v_exp.area_id;
  if clock_timestamp() < v_exp.started_at + make_interval(secs => v_rules.min_seconds) then
    raise exception 'O baú está emperrado. Tente de novo em alguns segundos.' using errcode = 'P0001';
  end if;

  update public.exploration_chests ch set opened_at = clock_timestamp()
  where ch.exploration_id = p_exploration_id and ch.chest_index = p_chest_index;

  -- Mesma regra de rollChestContents (packages/shared/src/procgen/chests.ts).
  v_copper := v_rules.copper_min + floor(random() * (v_rules.copper_max - v_rules.copper_min + 1))::integer;
  if random() < v_rules.gold_chance then
    v_gold := 1;
  end if;
  update public.characters c
  set copper = c.copper + v_copper, gold = c.gold + v_gold, updated_at = now()
  where c.id = v_char.id;

  for v_item in select i.* from public.area_chest_items i where i.area_id = v_exp.area_id order by i.item_id loop
    if random() < v_item.chance then
      v_qty := v_item.qty_min + floor(random() * (v_item.qty_max - v_item.qty_min + 1))::integer;
      insert into public.inventory_items as inv (character_id, item_id, quantity)
      values (v_char.id, v_item.item_id, v_qty)
      on conflict (character_id, item_id)
      do update set quantity = inv.quantity + excluded.quantity, updated_at = now()
      returning inv.quantity into v_total;
      v_drops := v_drops || jsonb_build_object('item_id', v_item.item_id, 'quantity', v_qty, 'total', v_total);
    end if;
  end loop;

  return jsonb_build_object('opened', true, 'copper_gained', v_copper, 'copper', v_char.copper + v_copper,
    'gold_gained', v_gold, 'gold', v_char.gold + v_gold, 'drops', v_drops);
end;
$$;

revoke all on function public.open_chest(uuid, integer) from public, anon;
grant execute on function public.open_chest(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Mensagens sem "Gruta" (mesma lógica de antes)
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
  select a.collect_cooldown_ms into v_cooldown from public.exploration_areas a where a.id = v_exp.area_id;
  if v_exp.last_collect_at is not null
     and clock_timestamp() < v_exp.last_collect_at + make_interval(secs => v_cooldown / 1000.0) then
    raise exception 'Aguarde um instante para coletar de novo.' using errcode = 'P0001';
  end if;

  update public.exploration_nodes n set collected_at = clock_timestamp()
  where n.exploration_id = p_exploration_id and n.node_index = p_node_index;
  update public.explorations e set last_collect_at = clock_timestamp() where e.id = p_exploration_id;

  insert into public.inventory_items as inv (character_id, item_id, quantity)
  values (v_exp.character_id, v_node.item_id, v_node.quantity)
  on conflict (character_id, item_id)
  do update set quantity = inv.quantity + excluded.quantity, updated_at = now()
  returning inv.quantity into v_total;

  return jsonb_build_object('item_id', v_node.item_id, 'quantity', v_node.quantity, 'collected', true, 'total', v_total);
end;
$$;

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
  -- segundo do nível vezes o tempo desde a entrada.
  select * into v_creature from public.creatures c where c.id = v_monster.creature_id;
  select coalesce(sum(c.hp), 0) into v_hp_done
  from public.exploration_monsters m join public.creatures c on c.id = m.creature_id
  where m.exploration_id = p_exploration_id and m.killed_at is not null;
  select r.max_dps_base + r.max_dps_per_level * v_char.level into v_cap from public.combat_rules r where r.id = 1;
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
      insert into public.inventory_items as inv (character_id, item_id, quantity)
      values (v_char.id, v_drop.item_id, v_qty)
      on conflict (character_id, item_id)
      do update set quantity = inv.quantity + excluded.quantity, updated_at = now()
      returning inv.quantity into v_total;
      v_drops := v_drops || jsonb_build_object('item_id', v_drop.item_id, 'quantity', v_qty, 'total', v_total);
    end if;
  end loop;

  return jsonb_build_object('killed', true, 'creature_id', v_creature.id, 'xp_gained', v_creature.xp,
    'xp', v_char.xp + v_creature.xp, 'level', greatest(v_char.level, v_level), 'leveled_up', v_level > v_char.level,
    'copper_gained', v_copper, 'copper', v_char.copper + v_copper, 'drops', v_drops);
end;
$$;
