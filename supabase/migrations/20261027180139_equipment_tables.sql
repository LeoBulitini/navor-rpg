-- Fase 11: equipamentos, Ferreiro (comprar, fabricar, melhorar e vender peças) e ferramentas de coleta.
-- Cada peça é uma linha de character_gear (não empilha) com nível de melhoria próprio. O cliente só lê as
-- próprias peças; comprar, fabricar, melhorar, vender, equipar e tirar passam por funções que conferem
-- dono, saldo, materiais e regras. Depósitos raros pedem picareta ou machado equipado (collect_node) e o
-- teto de dano por segundo dos abates soma o ataque dos equipamentos (kill_monster).
-- Catálogos (peças, receitas, custos de melhoria) vêm de content/ pela content_sync.
-- (parte 1: tabelas novas)

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

