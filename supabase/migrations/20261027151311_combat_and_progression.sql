-- Fase 6: monstros na exploração, abate validado no servidor, XP, nível e cobre.
-- O combate roda no navegador (tempo real); o servidor não simula golpes. Ele sorteia os monstros
-- de cada entrada, confere cada abate (dono, prazo, abate único e um teto de dano por segundo
-- compatível com o nível) e só então dá XP, cobre e itens, sorteados aqui.
-- Os dados (monstros, drops, XP por nível, teto de dano) vêm de content/ pela migration content_sync.

-- ---------------------------------------------------------------------------
-- Catálogo (cópia de content/; só o servidor lê)
-- ---------------------------------------------------------------------------
create table public.creatures (
  id         text primary key,
  name       text not null,
  hp         integer not null check (hp > 0),
  xp         integer not null check (xp >= 0),
  copper_min integer not null check (copper_min >= 0),
  copper_max integer not null,
  check (copper_min <= copper_max)
);

create table public.creature_drops (
  creature_id text not null references public.creatures (id) on delete cascade,
  item_id     text not null references public.items (id),
  chance      numeric not null check (chance > 0 and chance <= 1),
  qty_min     integer not null check (qty_min >= 1),
  qty_max     integer not null,
  primary key (creature_id, item_id),
  check (qty_min <= qty_max)
);

create table public.area_creatures (
  area_id     text not null references public.exploration_areas (id) on delete cascade,
  creature_id text not null references public.creatures (id),
  weight      integer not null check (weight > 0),
  primary key (area_id, creature_id)
);

alter table public.exploration_areas
  add column monsters_min integer not null default 0 check (monsters_min >= 0),
  add column monsters_max integer not null default 0;

-- XP total para chegar a cada nível (gerada a partir de content/progression.json).
create table public.level_thresholds (
  level    integer primary key check (level >= 0),
  total_xp bigint not null check (total_xp >= 0)
);

-- Uma linha só: teto de dano por segundo aceito ao validar abates (base + por nível).
create table public.combat_rules (
  id                integer primary key check (id = 1),
  max_dps_base      numeric not null check (max_dps_base > 0),
  max_dps_per_level numeric not null check (max_dps_per_level >= 0)
);

create table public.exploration_monsters (
  exploration_id uuid not null references public.explorations (id) on delete cascade,
  monster_index  integer not null check (monster_index >= 0),
  creature_id    text not null references public.creatures (id),
  killed_at      timestamptz,
  primary key (exploration_id, monster_index)
);

alter table public.creatures enable row level security;
alter table public.creature_drops enable row level security;
alter table public.area_creatures enable row level security;
alter table public.level_thresholds enable row level security;
alter table public.combat_rules enable row level security;
alter table public.exploration_monsters enable row level security;
revoke all on public.creatures, public.creature_drops, public.area_creatures, public.level_thresholds,
  public.combat_rules, public.exploration_monsters from anon, authenticated;

-- ---------------------------------------------------------------------------
-- start_exploration: agora também sorteia os monstros da entrada
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

  return jsonb_build_object(
    'exploration_id', v_id,
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
-- kill_monster: confere o abate e dá XP, nível, cobre e itens
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
    raise exception 'Esta exploração terminou. Entre na Gruta de novo.' using errcode = 'P0001';
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

-- Encerra a exploração (morte ou saída). O que sobrou nela se perde.
create or replace function public.end_exploration(p_exploration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  update public.explorations e set closed_at = now()
  where e.id = p_exploration_id and e.closed_at is null
    and exists (select 1 from public.characters c where c.id = e.character_id and c.user_id = auth.uid());
end;
$$;

revoke all on function public.kill_monster(uuid, integer) from public, anon;
revoke all on function public.end_exploration(uuid) from public, anon;
grant execute on function public.kill_monster(uuid, integer) to authenticated;
grant execute on function public.end_exploration(uuid) to authenticated;
