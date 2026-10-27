-- Fase 10: economia. Lojas dos NPCs (Alquimista, Taverna, Ferreiro), poções e comidas, dormitório da
-- Taverna e câmbio de cobre e ouro no Mercado. Tudo passa por funções que conferem dono, saldo, preço e
-- estoque e gravam numa transação só; o cliente nunca escreve moedas nem inventário.
-- Lojas e dormitório só funcionam na cidade: com uma exploração aberta, o servidor recusa.
-- Os catálogos (preços, o que cada NPC compra, valor dos itens) vêm de content/ pela content_sync.

alter table public.items
  add column value    integer not null default 0 check (value >= 0),
  add column use_hp   integer not null default 0 check (use_hp >= 0),
  add column use_mana integer not null default 0 check (use_mana >= 0);

create table public.shops (
  id         text primary key,
  name       text not null,
  rest_price integer check (rest_price >= 0),
  exchange   boolean not null default false
);

create table public.shop_sells (
  shop_id  text not null references public.shops (id) on delete cascade,
  item_id  text not null references public.items (id),
  price    integer not null check (price > 0),
  currency text not null check (currency in ('copper', 'gold')),
  primary key (shop_id, item_id)
);

-- O que cada NPC compra do jogador (as categorias de content/shops.json já vêm expandidas em itens).
create table public.shop_buys (
  shop_id text not null references public.shops (id) on delete cascade,
  item_id text not null references public.items (id),
  primary key (shop_id, item_id)
);

-- Uma linha só: quanto o NPC paga (fração do valor) e o câmbio.
create table public.economy_rules (
  id              integer primary key check (id = 1),
  sell_rate       numeric not null check (sell_rate > 0 and sell_rate <= 1),
  copper_per_gold integer not null check (copper_per_gold > 0)
);

alter table public.shops enable row level security;
alter table public.shop_sells enable row level security;
alter table public.shop_buys enable row level security;
alter table public.economy_rules enable row level security;
revoke all on public.shops, public.shop_sells, public.shop_buys, public.economy_rules from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Personagem do usuário, travado para a transação, e que precisa estar na cidade.
-- ---------------------------------------------------------------------------
create or replace function public.town_character(p_character_id uuid)
returns public.characters
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char public.characters;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  select c.* into v_char from public.characters c where c.id = p_character_id and c.user_id = auth.uid() for update;
  if v_char.id is null then
    raise exception 'Personagem não encontrado' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.explorations e
             where e.character_id = p_character_id and e.closed_at is null and e.expires_at > now()) then
    raise exception 'Volte para a cidade para usar este serviço.' using errcode = 'P0001';
  end if;
  return v_char;
end;
$$;
revoke all on function public.town_character(uuid) from public, anon, authenticated;

-- Soma (ou tira, com quantidade negativa) um item do inventário e devolve o total. Zerou, a linha some.
create or replace function public.inventory_add(p_character_id uuid, p_item_id text, p_quantity integer)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_have bigint;
begin
  if p_quantity > 0 then
    insert into public.inventory_items as inv (character_id, item_id, quantity)
    values (p_character_id, p_item_id, p_quantity)
    on conflict (character_id, item_id)
    do update set quantity = inv.quantity + excluded.quantity, updated_at = now()
    returning inv.quantity into v_have;
    return v_have;
  end if;
  select i.quantity into v_have from public.inventory_items i
  where i.character_id = p_character_id and i.item_id = p_item_id for update;
  if v_have is null or v_have < -p_quantity then
    raise exception 'Você não tem itens suficientes.' using errcode = 'P0001';
  end if;
  if v_have = -p_quantity then
    delete from public.inventory_items i where i.character_id = p_character_id and i.item_id = p_item_id;
    return 0;
  end if;
  update public.inventory_items i set quantity = i.quantity + p_quantity, updated_at = now()
  where i.character_id = p_character_id and i.item_id = p_item_id
  returning i.quantity into v_have;
  return v_have;
end;
$$;
revoke all on function public.inventory_add(uuid, text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Comprar de um NPC
-- ---------------------------------------------------------------------------
create or replace function public.shop_buy(p_character_id uuid, p_shop_id text, p_item_id text, p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char  public.characters;
  v_offer public.shop_sells;
  v_cost  bigint;
  v_total bigint;
begin
  v_char := public.town_character(p_character_id);
  if p_quantity is null or p_quantity < 1 or p_quantity > 99 then
    raise exception 'Quantidade inválida' using errcode = '22023';
  end if;
  select s.* into v_offer from public.shop_sells s where s.shop_id = p_shop_id and s.item_id = p_item_id;
  if not found then
    raise exception 'Este item não está à venda aqui.' using errcode = '22023';
  end if;
  v_cost := v_offer.price::bigint * p_quantity;
  if v_offer.currency = 'copper' and v_char.copper < v_cost then
    raise exception 'Cobre insuficiente.' using errcode = 'P0001';
  end if;
  if v_offer.currency = 'gold' and v_char.gold < v_cost then
    raise exception 'Ouro insuficiente.' using errcode = 'P0001';
  end if;
  update public.characters c
  set copper = c.copper - case when v_offer.currency = 'copper' then v_cost else 0 end,
      gold = c.gold - case when v_offer.currency = 'gold' then v_cost else 0 end,
      updated_at = now()
  where c.id = v_char.id
  returning c.* into v_char;
  v_total := public.inventory_add(v_char.id, p_item_id, p_quantity);
  return jsonb_build_object('item_id', p_item_id, 'total', v_total, 'copper', v_char.copper, 'gold', v_char.gold);
end;
$$;

-- ---------------------------------------------------------------------------
-- Vender para um NPC
-- ---------------------------------------------------------------------------
create or replace function public.shop_sell(p_character_id uuid, p_shop_id text, p_item_id text, p_quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char  public.characters;
  v_value integer;
  v_rate  numeric;
  v_gain  bigint;
  v_total bigint;
begin
  v_char := public.town_character(p_character_id);
  if p_quantity is null or p_quantity < 1 or p_quantity > 999 then
    raise exception 'Quantidade inválida' using errcode = '22023';
  end if;
  if not exists (select 1 from public.shop_buys b where b.shop_id = p_shop_id and b.item_id = p_item_id) then
    raise exception 'Este NPC não compra esse item.' using errcode = '22023';
  end if;
  -- Mesma regra de sellPrice (packages/shared/src/economy/shop.ts).
  select i.value into v_value from public.items i where i.id = p_item_id;
  select r.sell_rate into v_rate from public.economy_rules r where r.id = 1;
  v_gain := greatest(1, floor(v_value * v_rate))::bigint * p_quantity;
  v_total := public.inventory_add(v_char.id, p_item_id, -p_quantity);
  update public.characters c set copper = c.copper + v_gain, updated_at = now()
  where c.id = v_char.id returning c.* into v_char;
  return jsonb_build_object('item_id', p_item_id, 'total', v_total, 'earned', v_gain, 'copper', v_char.copper, 'gold', v_char.gold);
end;
$$;

-- ---------------------------------------------------------------------------
-- Usar uma poção ou comida: o servidor gasta o item; o efeito (vida, mana) vale no navegador.
-- ---------------------------------------------------------------------------
create or replace function public.use_item(p_character_id uuid, p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item  public.items;
  v_total bigint;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  if not exists (select 1 from public.characters c where c.id = p_character_id and c.user_id = auth.uid()) then
    raise exception 'Personagem não encontrado' using errcode = 'P0001';
  end if;
  select i.* into v_item from public.items i where i.id = p_item_id;
  if v_item.id is null or (v_item.use_hp = 0 and v_item.use_mana = 0) then
    raise exception 'Este item não pode ser usado.' using errcode = '22023';
  end if;
  v_total := public.inventory_add(p_character_id, p_item_id, -1);
  return jsonb_build_object('item_id', p_item_id, 'total', v_total, 'hp', v_item.use_hp, 'mana', v_item.use_mana);
end;
$$;

-- ---------------------------------------------------------------------------
-- Dormitório da Taverna: cobra e o navegador enche vida e mana.
-- ---------------------------------------------------------------------------
create or replace function public.tavern_rest(p_character_id uuid, p_shop_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char  public.characters;
  v_price integer;
begin
  v_char := public.town_character(p_character_id);
  select s.rest_price into v_price from public.shops s where s.id = p_shop_id;
  if v_price is null then
    raise exception 'Não há dormitório aqui.' using errcode = '22023';
  end if;
  if v_char.copper < v_price then
    raise exception 'Cobre insuficiente.' using errcode = 'P0001';
  end if;
  update public.characters c set copper = c.copper - v_price, updated_at = now()
  where c.id = v_char.id returning c.* into v_char;
  return jsonb_build_object('copper', v_char.copper, 'gold', v_char.gold);
end;
$$;

-- ---------------------------------------------------------------------------
-- Câmbio: p_amount moedas do destino ('gold' ou 'copper' em p_to). Mesma regra de exchange (shop.ts).
-- ---------------------------------------------------------------------------
create or replace function public.exchange_currency(p_character_id uuid, p_shop_id text, p_to text, p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char public.characters;
  v_rate integer;
begin
  v_char := public.town_character(p_character_id);
  if not exists (select 1 from public.shops s where s.id = p_shop_id and s.exchange) then
    raise exception 'Não há câmbio aqui.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000 or p_to not in ('gold', 'copper') then
    raise exception 'Quantidade inválida' using errcode = '22023';
  end if;
  select r.copper_per_gold into v_rate from public.economy_rules r where r.id = 1;
  if p_to = 'gold' then
    if v_char.copper < p_amount::bigint * v_rate then
      raise exception 'Cobre insuficiente.' using errcode = 'P0001';
    end if;
    update public.characters c set copper = c.copper - p_amount::bigint * v_rate, gold = c.gold + p_amount, updated_at = now()
    where c.id = v_char.id returning c.* into v_char;
  else
    if v_char.gold < p_amount then
      raise exception 'Ouro insuficiente.' using errcode = 'P0001';
    end if;
    update public.characters c set copper = c.copper + p_amount::bigint * v_rate, gold = c.gold - p_amount, updated_at = now()
    where c.id = v_char.id returning c.* into v_char;
  end if;
  return jsonb_build_object('copper', v_char.copper, 'gold', v_char.gold);
end;
$$;

revoke all on function public.shop_buy(uuid, text, text, integer) from public, anon;
revoke all on function public.shop_sell(uuid, text, text, integer) from public, anon;
revoke all on function public.use_item(uuid, text) from public, anon;
revoke all on function public.tavern_rest(uuid, text) from public, anon;
revoke all on function public.exchange_currency(uuid, text, text, integer) from public, anon;
grant execute on function public.shop_buy(uuid, text, text, integer) to authenticated;
grant execute on function public.shop_sell(uuid, text, text, integer) to authenticated;
grant execute on function public.use_item(uuid, text) to authenticated;
grant execute on function public.tavern_rest(uuid, text) to authenticated;
grant execute on function public.exchange_currency(uuid, text, text, integer) to authenticated;
