-- Fase 14: mercado entre jogadores e armazém da conta (GDD 7.1 e 11).
-- Mercado: o item anunciado sai do inventário do vendedor e fica guardado no anúncio. Comprar move moedas
-- e itens numa transação só (comprador, vendedor e anúncio travados), com taxa cobrada do vendedor.
-- Cancelar ou recolher um anúncio vencido devolve o que sobrou. Equipamentos ainda não entram no mercado.
-- Armazém: itens guardados por conta (todos os personagens do jogador), com limite de tipos de item.
-- Tudo só na cidade (town_character). Regras vêm de content/shops.json pela content_sync.

alter table public.shops
  add column player_market boolean not null default false,
  add column storage boolean not null default false;

create table public.market_rules (
  id            integer primary key check (id = 1),
  tax_percent   integer not null check (tax_percent between 0 and 50),
  max_listings  integer not null check (max_listings >= 1),
  expires_hours integer not null check (expires_hours >= 1),
  max_price     integer not null check (max_price >= 1)
);

create table public.storage_rules (
  id         integer primary key check (id = 1),
  max_stacks integer not null check (max_stacks >= 1)
);

alter table public.market_rules enable row level security;
alter table public.storage_rules enable row level security;
revoke all on public.market_rules, public.storage_rules from anon, authenticated;

-- Anúncios. Todos os jogadores leem os ativos; o vendedor também vê os próprios encerrados e vencidos.
create table public.market_listings (
  id               uuid primary key default gen_random_uuid(),
  seller_id        uuid not null references public.characters (id) on delete cascade,
  seller_user      uuid not null references auth.users (id) on delete cascade,
  seller_name      text not null,
  item_id          text not null references public.items (id),
  quantity         integer not null check (quantity >= 0),
  initial_quantity integer not null check (initial_quantity >= 1),
  price            integer not null check (price >= 1),
  currency         text not null check (currency in ('copper', 'gold')),
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  closed_at        timestamptz
);
create index market_listings_open on public.market_listings (item_id, price) where closed_at is null;
create index market_listings_seller on public.market_listings (seller_id);

alter table public.market_listings enable row level security;
revoke all on public.market_listings from anon, authenticated;
grant select on public.market_listings to authenticated;
create policy "market_listings: anúncios ativos para todos, os próprios para o vendedor"
  on public.market_listings for select
  to authenticated
  using ((closed_at is null and quantity > 0 and expires_at > now()) or seller_user = (select auth.uid()));

-- Registro das vendas (auditoria; o cliente não lê).
create table public.market_sales (
  id          bigint generated always as identity primary key,
  listing_id  uuid not null references public.market_listings (id) on delete cascade,
  buyer_id    uuid references public.characters (id) on delete set null,
  quantity    integer not null check (quantity >= 1),
  total       bigint not null check (total >= 0),
  tax         bigint not null check (tax >= 0),
  currency    text not null,
  sold_at     timestamptz not null default now()
);
alter table public.market_sales enable row level security;
revoke all on public.market_sales from anon, authenticated;

-- Armazém da conta. Retirar tudo deixa a linha com quantidade 0 (não é apagada); quantidade 0 não aparece
-- para o cliente nem conta no limite de tipos.
create table public.storage_items (
  user_id    uuid not null references auth.users (id) on delete cascade,
  item_id    text not null references public.items (id),
  quantity   bigint not null check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
alter table public.storage_items enable row level security;
revoke all on public.storage_items from anon, authenticated;
grant select on public.storage_items to authenticated;
create policy "storage_items: dono lê o próprio armazém"
  on public.storage_items for select
  to authenticated
  using (user_id = (select auth.uid()) and quantity > 0);

-- ---------------------------------------------------------------------------
-- Funções internas
-- ---------------------------------------------------------------------------

-- O prédio oferece o serviço? (mercado ou armazém)
create or replace function public.require_service(p_shop_id text, p_kind text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.shops s
    where s.id = p_shop_id and case p_kind when 'market' then s.player_market when 'storage' then s.storage else false end
  ) then
    raise exception 'Este serviço não fica aqui.' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.require_service(text, text) from public, anon, authenticated;

-- Item que pode ir ao mercado ou ao armazém (equipamentos ainda não).
create or replace function public.require_tradable(p_item_id text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.items i where i.id = p_item_id) then
    raise exception 'Item desconhecido.' using errcode = '22023';
  end if;
  if exists (select 1 from public.item_equip e where e.item_id = p_item_id) then
    raise exception 'Equipamentos ainda não podem ir ao mercado nem ao armazém.' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.require_tradable(text) from public, anon, authenticated;

create or replace function public.listing_json(p_listing public.market_listings)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('id', p_listing.id, 'item_id', p_listing.item_id, 'quantity', p_listing.quantity,
    'price', p_listing.price, 'currency', p_listing.currency, 'expires_at', p_listing.expires_at);
$$;
revoke all on function public.listing_json(public.market_listings) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Mercado
-- ---------------------------------------------------------------------------
create or replace function public.market_list(p_character_id uuid, p_shop_id text, p_item_id text, p_quantity integer, p_price integer, p_currency text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char    public.characters;
  v_rules   public.market_rules;
  v_listing public.market_listings;
  v_total   bigint;
begin
  v_char := public.town_character(p_character_id);
  perform public.require_service(p_shop_id, 'market');
  perform public.require_tradable(p_item_id);
  select r.* into v_rules from public.market_rules r where r.id = 1;
  if p_quantity is null or p_quantity < 1 or p_quantity > 999 then
    raise exception 'Quantidade inválida' using errcode = '22023';
  end if;
  if p_currency not in ('copper', 'gold') then
    raise exception 'Moeda inválida' using errcode = '22023';
  end if;
  if p_price is null or p_price < 1 or p_price > v_rules.max_price then
    raise exception 'Preço inválido (de 1 a %).', v_rules.max_price using errcode = 'P0001';
  end if;
  if (select count(*) from public.market_listings l
      where l.seller_id = v_char.id and l.closed_at is null and l.quantity > 0 and l.expires_at > now()) >= v_rules.max_listings then
    raise exception 'Você já tem % anúncios ativos.', v_rules.max_listings using errcode = 'P0001';
  end if;
  v_total := public.inventory_add(v_char.id, p_item_id, -p_quantity);
  insert into public.market_listings (seller_id, seller_user, seller_name, item_id, quantity, initial_quantity, price, currency, expires_at)
  values (v_char.id, v_char.user_id, v_char.name, p_item_id, p_quantity, p_quantity, p_price, p_currency,
    now() + make_interval(hours => v_rules.expires_hours))
  returning * into v_listing;
  return jsonb_build_object('listing', public.listing_json(v_listing), 'item_id', p_item_id, 'total', v_total);
end;
$$;

create or replace function public.market_buy(p_character_id uuid, p_shop_id text, p_listing_id uuid, p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char    public.characters;
  v_listing public.market_listings;
  v_cost    bigint;
  v_tax     bigint;
  v_total   bigint;
  v_rate    integer;
begin
  v_char := public.town_character(p_character_id);
  perform public.require_service(p_shop_id, 'market');
  if p_quantity is null or p_quantity < 1 or p_quantity > 999 then
    raise exception 'Quantidade inválida' using errcode = '22023';
  end if;
  select l.* into v_listing from public.market_listings l where l.id = p_listing_id for update;
  if v_listing.id is null or v_listing.closed_at is not null or v_listing.expires_at <= now() or v_listing.quantity = 0 then
    raise exception 'Este anúncio não está mais disponível.' using errcode = 'P0001';
  end if;
  if v_listing.seller_user = v_char.user_id then
    raise exception 'Você não pode comprar os próprios anúncios.' using errcode = 'P0001';
  end if;
  if v_listing.quantity < p_quantity then
    raise exception 'O anúncio só tem % unidade(s).', v_listing.quantity using errcode = 'P0001';
  end if;
  v_cost := v_listing.price::bigint * p_quantity;
  if v_listing.currency = 'copper' and v_char.copper < v_cost then
    raise exception 'Cobre insuficiente.' using errcode = 'P0001';
  end if;
  if v_listing.currency = 'gold' and v_char.gold < v_cost then
    raise exception 'Ouro insuficiente.' using errcode = 'P0001';
  end if;
  select r.tax_percent into v_rate from public.market_rules r where r.id = 1;
  -- Mesma regra de marketTax (packages/shared/src/economy/market.ts).
  v_tax := floor(v_cost * v_rate / 100.0)::bigint;

  update public.characters c
  set copper = c.copper - case when v_listing.currency = 'copper' then v_cost else 0 end,
      gold = c.gold - case when v_listing.currency = 'gold' then v_cost else 0 end,
      updated_at = now()
  where c.id = v_char.id
  returning c.* into v_char;
  update public.characters c
  set copper = c.copper + case when v_listing.currency = 'copper' then v_cost - v_tax else 0 end,
      gold = c.gold + case when v_listing.currency = 'gold' then v_cost - v_tax else 0 end,
      updated_at = now()
  where c.id = v_listing.seller_id;
  update public.market_listings l set quantity = l.quantity - p_quantity,
    closed_at = case when l.quantity = p_quantity then now() else null end
  where l.id = v_listing.id
  returning * into v_listing;
  insert into public.market_sales (listing_id, buyer_id, quantity, total, tax, currency)
  values (v_listing.id, v_char.id, p_quantity, v_cost, v_tax, v_listing.currency);
  v_total := public.inventory_add(v_char.id, v_listing.item_id, p_quantity);
  return jsonb_build_object('listing', public.listing_json(v_listing), 'item_id', v_listing.item_id, 'total', v_total,
    'copper', v_char.copper, 'gold', v_char.gold);
end;
$$;

-- Cancelar um anúncio ativo ou recolher um vencido: o que sobrou volta ao inventário.
create or replace function public.market_cancel(p_character_id uuid, p_shop_id text, p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char    public.characters;
  v_listing public.market_listings;
  v_total   bigint;
begin
  v_char := public.town_character(p_character_id);
  perform public.require_service(p_shop_id, 'market');
  select l.* into v_listing from public.market_listings l where l.id = p_listing_id and l.seller_id = v_char.id for update;
  if v_listing.id is null then
    raise exception 'Anúncio não encontrado.' using errcode = 'P0001';
  end if;
  if v_listing.closed_at is not null then
    raise exception 'Este anúncio já foi encerrado.' using errcode = 'P0001';
  end if;
  update public.market_listings l set closed_at = now() where l.id = v_listing.id returning * into v_listing;
  v_total := case when v_listing.quantity > 0 then public.inventory_add(v_char.id, v_listing.item_id, v_listing.quantity)
    else coalesce((select i.quantity from public.inventory_items i where i.character_id = v_char.id and i.item_id = v_listing.item_id), 0) end;
  return jsonb_build_object('listing', public.listing_json(v_listing), 'item_id', v_listing.item_id, 'returned', v_listing.quantity, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------------------
-- Armazém
-- ---------------------------------------------------------------------------
create or replace function public.storage_deposit(p_character_id uuid, p_shop_id text, p_item_id text, p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char   public.characters;
  v_max    integer;
  v_total  bigint;
  v_stored bigint;
begin
  v_char := public.town_character(p_character_id);
  perform public.require_service(p_shop_id, 'storage');
  perform public.require_tradable(p_item_id);
  if p_quantity is null or p_quantity < 1 or p_quantity > 9999 then
    raise exception 'Quantidade inválida' using errcode = '22023';
  end if;
  -- Uma operação de armazém por vez para a conta (vários personagens usam o mesmo).
  perform pg_advisory_xact_lock(hashtextextended(v_char.user_id::text, 3));
  select r.max_stacks into v_max from public.storage_rules r where r.id = 1;
  if not exists (select 1 from public.storage_items s where s.user_id = v_char.user_id and s.item_id = p_item_id and s.quantity > 0)
     and (select count(*) from public.storage_items s where s.user_id = v_char.user_id and s.quantity > 0) >= v_max then
    raise exception 'O armazém está cheio (% tipos de item). Retire algo antes.', v_max using errcode = 'P0001';
  end if;
  v_total := public.inventory_add(v_char.id, p_item_id, -p_quantity);
  insert into public.storage_items as s (user_id, item_id, quantity) values (v_char.user_id, p_item_id, p_quantity)
  on conflict (user_id, item_id) do update set quantity = s.quantity + excluded.quantity, updated_at = now()
  returning s.quantity into v_stored;
  return jsonb_build_object('item_id', p_item_id, 'total', v_total, 'stored', v_stored);
end;
$$;

create or replace function public.storage_withdraw(p_character_id uuid, p_shop_id text, p_item_id text, p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char   public.characters;
  v_stored bigint;
  v_total  bigint;
begin
  v_char := public.town_character(p_character_id);
  perform public.require_service(p_shop_id, 'storage');
  if p_quantity is null or p_quantity < 1 or p_quantity > 9999 then
    raise exception 'Quantidade inválida' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_char.user_id::text, 3));
  select s.quantity into v_stored from public.storage_items s where s.user_id = v_char.user_id and s.item_id = p_item_id for update;
  if v_stored is null or v_stored < p_quantity then
    raise exception 'Você não tem tudo isso no armazém.' using errcode = 'P0001';
  end if;
  update public.storage_items s set quantity = s.quantity - p_quantity, updated_at = now()
  where s.user_id = v_char.user_id and s.item_id = p_item_id
  returning s.quantity into v_stored;
  v_total := public.inventory_add(v_char.id, p_item_id, p_quantity);
  return jsonb_build_object('item_id', p_item_id, 'total', v_total, 'stored', v_stored);
end;
$$;

revoke all on function public.market_list(uuid, text, text, integer, integer, text) from public, anon;
revoke all on function public.market_buy(uuid, text, uuid, integer) from public, anon;
revoke all on function public.market_cancel(uuid, text, uuid) from public, anon;
revoke all on function public.storage_deposit(uuid, text, text, integer) from public, anon;
revoke all on function public.storage_withdraw(uuid, text, text, integer) from public, anon;
grant execute on function public.market_list(uuid, text, text, integer, integer, text) to authenticated;
grant execute on function public.market_buy(uuid, text, uuid, integer) to authenticated;
grant execute on function public.market_cancel(uuid, text, uuid) to authenticated;
grant execute on function public.storage_deposit(uuid, text, text, integer) to authenticated;
grant execute on function public.storage_withdraw(uuid, text, text, integer) to authenticated;
