-- Fase 13: missões diárias (Daily Quest) e Covil do Dragão (chefe diário). GDD 12.
-- O dia do jogo vira às 00:00 de Brasília e é contado pela hora do servidor (game_day), nunca pelo relógio
-- do jogador. A cada dia o servidor sorteia as missões do personagem entre as do nível dele, conta o
-- progresso pelos abates e coletas que ele mesmo validou (gatilhos) e entrega a recompensa uma vez, na
-- cidade. Áreas diárias (Covil do Dragão) aceitam uma entrada por personagem por dia.
-- Catálogo das missões vem de content/quests.json pela content_sync.

alter table public.exploration_areas
  add column daily boolean not null default false,
  add column min_level integer not null default 0 check (min_level >= 0);

-- Dia do jogo (America/Sao_Paulo). Mesma regra de gameDay (packages/shared/src/quests/daily.ts).
create or replace function public.game_day()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Entradas nas áreas diárias, uma por personagem, área e dia.
create table public.daily_area_entries (
  character_id uuid not null references public.characters (id) on delete cascade,
  area_id      text not null references public.exploration_areas (id) on delete cascade,
  day          date not null,
  entered_at   timestamptz not null default now(),
  primary key (character_id, area_id, day)
);
alter table public.daily_area_entries enable row level security;
revoke all on public.daily_area_entries from anon, authenticated;
grant select on public.daily_area_entries to authenticated;
create policy "daily_area_entries: dono lê as próprias entradas"
  on public.daily_area_entries for select
  to authenticated
  using (exists (
    select 1 from public.characters c
    where c.id = character_id and c.user_id = (select auth.uid())
  ));

-- Catálogo das missões (content/quests.json).
create table public.quest_rules (
  id      integer primary key check (id = 1),
  per_day integer not null check (per_day >= 1)
);

create table public.quest_templates (
  id            text primary key,
  name          text not null,
  kind          text not null check (kind in ('kill', 'collect')),
  target        text not null,
  count         integer not null check (count >= 1),
  min_level     integer not null check (min_level >= 0),
  max_level     integer check (max_level >= min_level),
  reward_xp     integer not null check (reward_xp >= 0),
  reward_copper integer not null check (reward_copper >= 0)
);

create table public.quest_reward_items (
  quest_id text not null references public.quest_templates (id) on delete cascade,
  item_id  text not null references public.items (id),
  quantity integer not null check (quantity >= 1),
  primary key (quest_id, item_id)
);

alter table public.quest_rules enable row level security;
alter table public.quest_templates enable row level security;
alter table public.quest_reward_items enable row level security;
revoke all on public.quest_rules, public.quest_templates, public.quest_reward_items from anon, authenticated;

-- Missões do dia de cada personagem. O progresso só muda pelos gatilhos abaixo.
create table public.daily_quests (
  character_id uuid not null references public.characters (id) on delete cascade,
  day          date not null,
  slot         integer not null check (slot >= 0),
  quest_id     text not null references public.quest_templates (id),
  progress     integer not null default 0 check (progress >= 0),
  claimed_at   timestamptz,
  primary key (character_id, day, slot),
  unique (character_id, day, quest_id)
);
alter table public.daily_quests enable row level security;
revoke all on public.daily_quests from anon, authenticated;
grant select on public.daily_quests to authenticated;
create policy "daily_quests: dono lê as missões dos próprios personagens"
  on public.daily_quests for select
  to authenticated
  using (exists (
    select 1 from public.characters c
    where c.id = character_id and c.user_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Funções internas (o cliente não chama)
-- ---------------------------------------------------------------------------

-- Sorteia as missões do dia, se ainda não existem. Mesma regra de pickDailyQuests.
create or replace function public.ensure_daily_quests(p_character_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day   date := public.game_day();
  v_level integer;
  v_per   integer;
begin
  if exists (select 1 from public.daily_quests d where d.character_id = p_character_id and d.day = v_day) then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_character_id::text, 2));
  if exists (select 1 from public.daily_quests d where d.character_id = p_character_id and d.day = v_day) then
    return;
  end if;
  select c.level into v_level from public.characters c where c.id = p_character_id;
  select r.per_day into v_per from public.quest_rules r where r.id = 1;
  insert into public.daily_quests (character_id, day, slot, quest_id)
  select p_character_id, v_day, (row_number() over (order by x.pick) - 1)::integer, x.id
  from (
    select t.id, random() as pick from public.quest_templates t
    where t.min_level <= v_level and (t.max_level is null or v_level <= t.max_level)
    order by pick
    limit v_per
  ) x;
end;
$$;
revoke all on function public.ensure_daily_quests(uuid) from public, anon, authenticated;

-- Avança as missões do dia de um tipo e alvo (até a quantidade pedida).
create or replace function public.quest_advance(p_character_id uuid, p_kind text, p_target text, p_amount integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ensure_daily_quests(p_character_id);
  update public.daily_quests d set progress = least(t.count, d.progress + p_amount)
  from public.quest_templates t
  where t.id = d.quest_id and d.character_id = p_character_id and d.day = public.game_day()
    and d.claimed_at is null and t.kind = p_kind and t.target = p_target;
end;
$$;
revoke all on function public.quest_advance(uuid, text, text, integer) from public, anon, authenticated;

-- Gatilhos: só contam abates e coletas que kill_monster e collect_node aceitaram.
create or replace function public.quest_on_kill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.killed_at is not null and old.killed_at is null then
    perform public.quest_advance((select e.character_id from public.explorations e where e.id = new.exploration_id), 'kill', new.creature_id, 1);
  end if;
  return new;
end;
$$;
revoke all on function public.quest_on_kill() from public, anon, authenticated;

create or replace function public.quest_on_collect()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.collected_at is not null and old.collected_at is null then
    perform public.quest_advance((select e.character_id from public.explorations e where e.id = new.exploration_id), 'collect', new.item_id, new.quantity);
  end if;
  return new;
end;
$$;
revoke all on function public.quest_on_collect() from public, anon, authenticated;

create trigger exploration_monsters_quests after update of killed_at on public.exploration_monsters
  for each row execute function public.quest_on_kill();
create trigger exploration_nodes_quests after update of collected_at on public.exploration_nodes
  for each row execute function public.quest_on_collect();

-- ---------------------------------------------------------------------------
-- Missões do dia: lista (sorteia na primeira vez do dia) e recompensa
-- ---------------------------------------------------------------------------
create or replace function public.list_daily_quests(p_character_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  if not exists (select 1 from public.characters c where c.id = p_character_id and c.user_id = auth.uid()) then
    raise exception 'Personagem não encontrado' using errcode = 'P0001';
  end if;
  perform public.ensure_daily_quests(p_character_id);
  return jsonb_build_object(
    'day', public.game_day(),
    'quests', coalesce((
      select jsonb_agg(jsonb_build_object('slot', d.slot, 'quest_id', d.quest_id, 'progress', d.progress, 'claimed', d.claimed_at is not null) order by d.slot)
      from public.daily_quests d where d.character_id = p_character_id and d.day = public.game_day()
    ), '[]'::jsonb),
    'daily_areas', coalesce((
      select jsonb_agg(x.area_id order by x.area_id)
      from public.daily_area_entries x where x.character_id = p_character_id and x.day = public.game_day()
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.claim_quest(p_character_id uuid, p_slot integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char  public.characters;
  v_quest public.daily_quests;
  v_t     public.quest_templates;
  v_level integer;
  v_r     record;
  v_items jsonb := '[]'::jsonb;
begin
  v_char := public.town_character(p_character_id);
  select d.* into v_quest from public.daily_quests d
  where d.character_id = v_char.id and d.day = public.game_day() and d.slot = p_slot for update;
  if v_quest.quest_id is null then
    raise exception 'Missão não encontrada.' using errcode = 'P0001';
  end if;
  if v_quest.claimed_at is not null then
    raise exception 'Você já recebeu esta recompensa.' using errcode = 'P0001';
  end if;
  select t.* into v_t from public.quest_templates t where t.id = v_quest.quest_id;
  if v_quest.progress < v_t.count then
    raise exception 'A missão ainda não foi concluída.' using errcode = 'P0001';
  end if;
  update public.daily_quests d set claimed_at = now()
  where d.character_id = v_quest.character_id and d.day = v_quest.day and d.slot = v_quest.slot;
  select coalesce(max(t.level), 0) into v_level from public.level_thresholds t where t.total_xp <= v_char.xp + v_t.reward_xp;
  update public.characters c
  set xp = c.xp + v_t.reward_xp,
      level = greatest(c.level, v_level),
      copper = c.copper + v_t.reward_copper,
      updated_at = now()
  where c.id = v_char.id;
  for v_r in select r.* from public.quest_reward_items r where r.quest_id = v_t.id order by r.item_id loop
    v_items := v_items || jsonb_build_object('item_id', v_r.item_id, 'quantity', v_r.quantity, 'total', public.inventory_add(v_char.id, v_r.item_id, v_r.quantity));
  end loop;
  return jsonb_build_object('slot', p_slot, 'quest_id', v_t.id, 'xp_gained', v_t.reward_xp, 'xp', v_char.xp + v_t.reward_xp,
    'level', greatest(v_char.level, v_level), 'leveled_up', v_level > v_char.level, 'copper_gained', v_t.reward_copper,
    'copper', v_char.copper + v_t.reward_copper, 'gold', v_char.gold, 'items', v_items);
end;
$$;

revoke all on function public.list_daily_quests(uuid) from public, anon;
revoke all on function public.claim_quest(uuid, integer) from public, anon;
grant execute on function public.list_daily_quests(uuid) to authenticated;
grant execute on function public.claim_quest(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Entrar numa área: nível mínimo e limite diário (Covil do Dragão).
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
  v_level    integer;
begin
  if v_user is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  select c.level into v_level from public.characters c where c.id = p_character_id and c.user_id = v_user;
  if v_level is null then
    raise exception 'Personagem não encontrado' using errcode = 'P0001';
  end if;
  select * into v_area from public.exploration_areas a where a.id = p_area_id;
  if not found then
    raise exception 'Área desconhecida: %', p_area_id using errcode = '22023';
  end if;
  if v_level < v_area.min_level then
    raise exception 'Você precisa estar no nível % para entrar aqui.', v_area.min_level using errcode = 'P0001';
  end if;

  -- Uma entrada por vez para o mesmo personagem.
  perform pg_advisory_xact_lock(hashtextextended(p_character_id::text, 1));
  select count(*) into v_count from public.explorations e
  where e.character_id = p_character_id and e.started_at > now() - interval '1 minute';
  if v_count >= v_area.max_starts_per_minute then
    raise exception 'Muitas entradas seguidas. Aguarde um minuto.' using errcode = 'P0001';
  end if;

  -- Área diária (Covil do Dragão): uma entrada por dia do jogo. Entrar gasta a vez, mesmo sem vencer.
  if v_area.daily then
    insert into public.daily_area_entries (character_id, area_id, day) values (p_character_id, p_area_id, public.game_day())
    on conflict do nothing;
    if not found then
      raise exception 'Você já entrou aqui hoje. Volte amanhã (o dia vira à meia-noite, horário de Brasília).' using errcode = 'P0001';
    end if;
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
