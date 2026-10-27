-- Fase 5: itens, explorações (Gruta), pontos de coleta e inventário.
-- Regra de segurança: o servidor sorteia a seed e o conteúdo de cada ponto de coleta e grava o
-- inventário. O cliente só LÊ o próprio inventário; toda escrita passa por funções security definer.
-- Os dados de catálogo (itens, regras de sorteio) vêm de content/ pela migration "content_sync"
-- gerada com `npm run db:content`.

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
create table public.items (
  id       text primary key,
  name     text not null,
  rarity   text not null,
  category text not null
);

alter table public.items enable row level security;
revoke all on public.items from anon, authenticated;
grant select on public.items to anon, authenticated;
create policy "items: leitura pública"
  on public.items for select
  to anon, authenticated
  using (true);

-- Regras de cada área com pontos de coleta (espelha content/procedural.json -> resources).
create table public.exploration_areas (
  id                    text primary key,
  nodes_min             integer not null check (nodes_min >= 0),
  nodes_max             integer not null,
  expires_minutes       integer not null check (expires_minutes > 0),
  collect_cooldown_ms   integer not null check (collect_cooldown_ms >= 0),
  max_starts_per_minute integer not null check (max_starts_per_minute > 0),
  check (nodes_min <= nodes_max)
);

create table public.area_rarity_rules (
  area_id text not null references public.exploration_areas (id) on delete cascade,
  rarity  text not null,
  weight  integer not null check (weight > 0),
  qty_min integer not null check (qty_min >= 1),
  qty_max integer not null,
  primary key (area_id, rarity),
  check (qty_min <= qty_max)
);

create table public.area_items (
  area_id text not null references public.exploration_areas (id) on delete cascade,
  item_id text not null references public.items (id),
  primary key (area_id, item_id)
);

-- Regras internas do servidor: o cliente não lê nem altera.
alter table public.exploration_areas enable row level security;
alter table public.area_rarity_rules enable row level security;
alter table public.area_items enable row level security;
revoke all on public.exploration_areas, public.area_rarity_rules, public.area_items from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Explorações e pontos de coleta
-- ---------------------------------------------------------------------------
create table public.explorations (
  id              uuid primary key default gen_random_uuid(),
  character_id    uuid not null references public.characters (id) on delete cascade,
  area_id         text not null references public.exploration_areas (id),
  seed            bigint not null check (seed between 0 and 4294967295),
  started_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  closed_at       timestamptz,
  last_collect_at timestamptz
);
create index explorations_character_started_idx on public.explorations (character_id, started_at desc);

create table public.exploration_nodes (
  exploration_id uuid not null references public.explorations (id) on delete cascade,
  node_index     integer not null check (node_index >= 0),
  item_id        text not null references public.items (id),
  quantity       integer not null check (quantity > 0),
  collected_at   timestamptz,
  primary key (exploration_id, node_index)
);

alter table public.explorations enable row level security;
alter table public.exploration_nodes enable row level security;
revoke all on public.explorations, public.exploration_nodes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Inventário: uma linha por item, com o mesmo item empilhado (sem limite de espaços por enquanto)
-- ---------------------------------------------------------------------------
create table public.inventory_items (
  character_id uuid not null references public.characters (id) on delete cascade,
  item_id      text not null references public.items (id),
  quantity     bigint not null check (quantity > 0),
  updated_at   timestamptz not null default now(),
  primary key (character_id, item_id)
);

alter table public.inventory_items enable row level security;
revoke all on public.inventory_items from anon, authenticated;
grant select on public.inventory_items to authenticated;
create policy "inventory_items: dono lê o inventário dos próprios personagens"
  on public.inventory_items for select
  to authenticated
  using (exists (
    select 1 from public.characters c
    where c.id = character_id and c.user_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Funções de servidor
-- ---------------------------------------------------------------------------

-- Entra numa área: encerra a exploração anterior do personagem, sorteia a seed e o conteúdo dos
-- pontos de coleta e devolve tudo. O cliente gera o mapa a partir da seed e só posiciona os pontos.
create or replace function public.start_exploration(p_character_id uuid, p_area_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid := auth.uid();
  v_area   public.exploration_areas;
  v_id     uuid;
  v_seed   bigint;
  v_count  integer;
  v_total  integer;
  v_pick   double precision;
  v_rule   record;
  v_item   text;
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

  -- Entrar de novo encerra a exploração anterior; os pontos que sobraram nela se perdem.
  update public.explorations e set closed_at = now()
  where e.character_id = p_character_id and e.closed_at is null;

  v_seed := floor(random() * 4294967296)::bigint;
  insert into public.explorations (character_id, area_id, seed, expires_at)
  values (p_character_id, p_area_id, v_seed, now() + make_interval(mins => v_area.expires_minutes))
  returning id into v_id;

  -- Mesma regra de rollResourceNodes (packages/shared/src/procgen/resources.ts):
  -- quantidade de pontos, raridade pelo peso, um item daquela raridade e a quantidade da faixa.
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

  return jsonb_build_object(
    'exploration_id', v_id,
    'seed', v_seed,
    'nodes', coalesce((
      select jsonb_agg(jsonb_build_object('index', n.node_index, 'item_id', n.item_id, 'quantity', n.quantity) order by n.node_index)
      from public.exploration_nodes n where n.exploration_id = v_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Coleta um ponto. Pedir de novo o mesmo ponto não soma nada (devolve collected = false),
-- então recarregar a página, clicar duas vezes ou reconectar não duplica o item.
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
    raise exception 'Esta exploração terminou. Entre na Gruta de novo.' using errcode = 'P0001';
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

revoke all on function public.start_exploration(uuid, text) from public, anon;
revoke all on function public.collect_node(uuid, integer) from public, anon;
grant execute on function public.start_exploration(uuid, text) to authenticated;
grant execute on function public.collect_node(uuid, integer) to authenticated;
