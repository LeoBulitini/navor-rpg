-- Fase 12: pontos de habilidade, árvores por classe, níveis de foco com pergaminho e evolução de classe.
-- O cliente só lê as próprias habilidades; aprender e evoluir passam por funções que conferem pontos,
-- ordem das graduações, pergaminho, nível e moedas. Os bônus de Coleta de Caça e Saque Especializado
-- (mais chance de itens) valem no servidor; o teto de dano por segundo soma os pontos gastos.
-- Catálogos (habilidades, custos, evolução) vêm de content/skills.json pela content_sync.

alter table public.combat_rules add column max_dps_per_skill_point_percent numeric not null default 0
  check (max_dps_per_skill_point_percent >= 0);

-- Uma linha só: pontos por nível.
create table public.skill_rules (
  id               integer primary key check (id = 1),
  points_per_level integer not null check (points_per_level > 0)
);

create table public.skills (
  id       text primary key,
  class_id text not null references public.classes (id),
  kind     text not null check (kind in ('active', 'passive')),
  -- efeito do aprimoramento (só o que o servidor usa: dropChancePercent)
  effect   text
);

-- Pontos e pergaminho de cada graduação (aprimoramento) ou foco (ativa). A maior graduação é o máximo.
create table public.skill_grades (
  skill_id       text not null references public.skills (id) on delete cascade,
  grade          integer not null check (grade >= 1),
  points         integer not null check (points >= 1),
  scroll_item_id text references public.items (id),
  -- valor total do efeito nesta graduação (aprimoramentos)
  effect_value   numeric,
  primary key (skill_id, grade)
);

-- Custo de evoluir para a etapa de classe do nível (25, 50, 75).
create table public.class_evolution (
  level  integer primary key check (level >= 1),
  copper integer not null check (copper >= 0),
  gold   integer not null check (gold >= 0)
);

alter table public.skill_rules enable row level security;
alter table public.skills enable row level security;
alter table public.skill_grades enable row level security;
alter table public.class_evolution enable row level security;
revoke all on public.skill_rules, public.skills, public.skill_grades, public.class_evolution from anon, authenticated;

create table public.character_skills (
  character_id uuid not null references public.characters (id) on delete cascade,
  skill_id     text not null references public.skills (id),
  grade        integer not null check (grade >= 1),
  updated_at   timestamptz not null default now(),
  primary key (character_id, skill_id)
);

alter table public.character_skills enable row level security;
revoke all on public.character_skills from anon, authenticated;
grant select on public.character_skills to authenticated;
create policy "character_skills: dono lê as habilidades dos próprios personagens"
  on public.character_skills for select
  to authenticated
  using (exists (
    select 1 from public.characters c
    where c.id = character_id and c.user_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Funções internas (o cliente não chama)
-- ---------------------------------------------------------------------------

-- Pontos gastos: soma dos custos de todas as graduações aprendidas. Mesma regra de spentPoints.
create or replace function public.skill_points_spent(p_character_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(g.points), 0)::integer
  from public.character_skills s join public.skill_grades g on g.skill_id = s.skill_id and g.grade <= s.grade
  where s.character_id = p_character_id;
$$;
revoke all on function public.skill_points_spent(uuid) from public, anon, authenticated;

-- % a mais na chance de itens (Coleta de Caça, Saque Especializado).
create or replace function public.skill_drop_bonus(p_character_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(g.effect_value), 0)
  from public.character_skills s
  join public.skills k on k.id = s.skill_id and k.effect = 'dropChancePercent'
  join public.skill_grades g on g.skill_id = s.skill_id and g.grade = s.grade
  where s.character_id = p_character_id;
$$;
revoke all on function public.skill_drop_bonus(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Aprender (graduação ou foco seguinte). Em qualquer lugar. Mesma regra de learnBlock.
-- ---------------------------------------------------------------------------
create or replace function public.learn_skill(p_character_id uuid, p_skill_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char    public.characters;
  v_class   public.classes;
  v_skill   public.skills;
  v_owner   public.classes;
  v_grade   integer;
  v_cost    public.skill_grades;
  v_per     integer;
  v_left    integer;
  v_scroll  jsonb := null;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  select c.* into v_char from public.characters c where c.id = p_character_id and c.user_id = auth.uid() for update;
  if v_char.id is null then
    raise exception 'Personagem não encontrado' using errcode = 'P0001';
  end if;
  select k.* into v_class from public.classes k where k.id = v_char.class_id;
  select s.* into v_skill from public.skills s where s.id = p_skill_id;
  select k.* into v_owner from public.classes k where k.id = v_skill.class_id;
  if v_skill.id is null or v_owner.path_id <> v_class.path_id or v_owner.unlock_level > v_class.unlock_level then
    raise exception 'Sua classe não tem esta habilidade.' using errcode = 'P0001';
  end if;
  select coalesce((select s.grade from public.character_skills s where s.character_id = v_char.id and s.skill_id = p_skill_id), 0)
  into v_grade;
  select g.* into v_cost from public.skill_grades g where g.skill_id = p_skill_id and g.grade = v_grade + 1;
  if v_cost.skill_id is null then
    raise exception 'Esta habilidade já está no máximo.' using errcode = 'P0001';
  end if;
  select r.points_per_level into v_per from public.skill_rules r where r.id = 1;
  v_left := v_char.level * v_per - public.skill_points_spent(v_char.id);
  if v_left < v_cost.points then
    raise exception 'Pontos de habilidade insuficientes.' using errcode = 'P0001';
  end if;
  if v_cost.scroll_item_id is not null then
    if coalesce((select i.quantity from public.inventory_items i where i.character_id = v_char.id and i.item_id = v_cost.scroll_item_id), 0) < 1 then
      raise exception 'Falta o pergaminho deste foco.' using errcode = 'P0001';
    end if;
    v_scroll := jsonb_build_object('item_id', v_cost.scroll_item_id, 'total', public.inventory_add(v_char.id, v_cost.scroll_item_id, -1));
  end if;
  insert into public.character_skills as cs (character_id, skill_id, grade) values (v_char.id, p_skill_id, 1)
  on conflict (character_id, skill_id) do update set grade = cs.grade + 1, updated_at = now();
  return jsonb_build_object('skill_id', p_skill_id, 'grade', v_grade + 1, 'points_left', v_left - v_cost.points, 'scroll', v_scroll);
end;
$$;

-- ---------------------------------------------------------------------------
-- Evoluir para a próxima classe do caminho (na cidade). Habilidades aprendidas continuam.
-- ---------------------------------------------------------------------------
create or replace function public.evolve_class(p_character_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char  public.characters;
  v_class public.classes;
  v_next  public.classes;
  v_cost  public.class_evolution;
begin
  v_char := public.town_character(p_character_id);
  select k.* into v_class from public.classes k where k.id = v_char.class_id;
  select k.* into v_next from public.classes k
  where k.path_id = v_class.path_id and k.unlock_level > v_class.unlock_level
  order by k.unlock_level limit 1;
  if v_next.id is null then
    raise exception 'Sua classe já é a última do caminho.' using errcode = 'P0001';
  end if;
  if v_char.level < v_next.unlock_level then
    raise exception 'Nível insuficiente para evoluir.' using errcode = 'P0001';
  end if;
  select e.* into v_cost from public.class_evolution e where e.level = v_next.unlock_level;
  if v_cost.level is null then
    raise exception 'Evolução indisponível.' using errcode = 'P0001';
  end if;
  if v_char.copper < v_cost.copper then
    raise exception 'Cobre insuficiente.' using errcode = 'P0001';
  end if;
  if v_char.gold < v_cost.gold then
    raise exception 'Ouro insuficiente.' using errcode = 'P0001';
  end if;
  update public.characters c
  set class_id = v_next.id, copper = c.copper - v_cost.copper, gold = c.gold - v_cost.gold, updated_at = now()
  where c.id = v_char.id returning c.* into v_char;
  return jsonb_build_object('class_id', v_char.class_id, 'copper', v_char.copper, 'gold', v_char.gold);
end;
$$;

-- ---------------------------------------------------------------------------
-- Abate: teto com os pontos de habilidade; chance de itens com Coleta de Caça e Saque Especializado.
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
  v_bonus    numeric;
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
  -- segundo (nível, equipamentos e pontos de habilidade) vezes o tempo desde a entrada. Mesma regra de serverMaxDps.
  select * into v_creature from public.creatures c where c.id = v_monster.creature_id;
  select coalesce(sum(c.hp), 0) into v_hp_done
  from public.exploration_monsters m join public.creatures c on c.id = m.creature_id
  where m.exploration_id = p_exploration_id and m.killed_at is not null;
  select (r.max_dps_base + r.max_dps_per_level * v_char.level + r.max_dps_per_attack * public.gear_attack_bonus(v_char.id))
         * (1 + r.max_dps_per_skill_point_percent * public.skill_points_spent(v_char.id) / 100)
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

  v_bonus := 1 + public.skill_drop_bonus(v_char.id) / 100;
  for v_drop in select d.* from public.creature_drops d where d.creature_id = v_creature.id order by d.item_id loop
    if random() < least(1, v_drop.chance * v_bonus) then
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

-- Baús: Saque Especializado aumenta a chance dos itens.
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
  v_bonus  numeric;
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

  v_bonus := 1 + public.skill_drop_bonus(v_char.id) / 100;
  for v_item in select i.* from public.area_chest_items i where i.area_id = v_exp.area_id order by i.item_id loop
    if random() < least(1, v_item.chance * v_bonus) then
      v_qty := v_item.qty_min + floor(random() * (v_item.qty_max - v_item.qty_min + 1))::integer;
      v_total := public.inventory_add(v_char.id, v_item.item_id, v_qty);
      v_drops := v_drops || jsonb_build_object('item_id', v_item.item_id, 'quantity', v_qty, 'total', v_total);
    end if;
  end loop;

  return jsonb_build_object('opened', true, 'copper_gained', v_copper, 'copper', v_char.copper + v_copper,
    'gold_gained', v_gold, 'gold', v_char.gold + v_gold, 'drops', v_drops);
end;
$$;

revoke all on function public.learn_skill(uuid, text) from public, anon;
revoke all on function public.evolve_class(uuid) from public, anon;
grant execute on function public.learn_skill(uuid, text) to authenticated;
grant execute on function public.evolve_class(uuid) to authenticated;
