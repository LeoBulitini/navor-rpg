-- Fase 2: catálogo de classes e personagens.
-- Regra de segurança: o cliente só LÊ os próprios personagens. Toda escrita passa por
-- funções no servidor (security definer), que validam os dados antes de gravar.

-- ---------------------------------------------------------------------------
-- Catálogo de classes (espelha content/classes.json; um teste garante que batem)
-- ---------------------------------------------------------------------------
create table public.classes (
  id           text primary key,
  name         text not null,
  path_id      text not null,
  unlock_level integer not null check (unlock_level between 0 and 75),
  -- Classes iniciais disponíveis para criação. No protótipo (MVP P1) só o Mago.
  playable     boolean not null default false
);

insert into public.classes (id, name, path_id, unlock_level, playable) values
  ('mage',         'Mago',          'magic',  0,  true),
  ('sorcerer',     'Feiticeiro',    'magic',  25, false),
  ('elementalist', 'Elementarista', 'magic',  50, false),
  ('necromancer',  'Necromante',    'magic',  75, false),
  ('warrior',      'Guerreiro',     'melee',  0,  false),
  ('swordsman',    'Espadachim',    'melee',  25, false),
  ('paladin',      'Paladino',      'melee',  50, false),
  ('berserker',    'Berserker',     'melee',  75, false),
  ('archer',       'Arqueiro',      'ranged', 0,  false),
  ('hunter',       'Caçador',       'ranged', 25, false),
  ('thief',        'Ladrão',        'ranged', 50, false),
  ('assassin',     'Assassino',     'ranged', 75, false);

alter table public.classes enable row level security;
revoke all on public.classes from anon, authenticated;
grant select on public.classes to anon, authenticated;
create policy "classes: leitura pública"
  on public.classes for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Personagens
-- ---------------------------------------------------------------------------
create table public.characters (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  class_id   text not null references public.classes (id),
  level      integer not null default 0 check (level between 0 and 75),
  xp         bigint  not null default 0 check (xp >= 0),
  -- Moedas: só o servidor altera. Cobre e ouro separados (conversão A DEFINIR).
  copper     bigint  not null default 0 check (copper >= 0),
  gold       bigint  not null default 0 check (gold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Validação técnica provisória do nome (política de nomes: A DEFINIR no GDD).
  constraint characters_name_format check (name ~ '^[A-Za-zÀ-ÖØ-öø-ÿ0-9]{3,16}$')
);

create unique index characters_name_unique_ci on public.characters (lower(name));
create index characters_user_id_idx on public.characters (user_id);

alter table public.characters enable row level security;
-- Nenhuma escrita direta pelo cliente: só leitura, e só das próprias linhas.
revoke all on public.characters from anon, authenticated;
grant select on public.characters to authenticated;
create policy "characters: dono lê os próprios"
  on public.characters for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Funções de servidor
-- ---------------------------------------------------------------------------
create or replace function public.create_character(p_name text, p_class_id text)
returns public.characters
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_name  text := btrim(p_name);
  v_count integer;
  v_row   public.characters;
  -- Limite provisório de personagens por conta (regra de conta: A DEFINIR no GDD).
  c_max_characters constant integer := 3;
begin
  if v_user is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;

  if v_name is null or v_name !~ '^[A-Za-zÀ-ÖØ-öø-ÿ0-9]{3,16}$' then
    raise exception 'Nome inválido: use de 3 a 16 letras ou números, sem espaços'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.classes c where c.id = p_class_id and c.playable and c.unlock_level = 0) then
    raise exception 'Classe inicial indisponível: %', p_class_id using errcode = '22023';
  end if;

  -- Trava por usuário para que duas chamadas simultâneas não passem do limite.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select count(*) into v_count from public.characters ch where ch.user_id = v_user;
  if v_count >= c_max_characters then
    raise exception 'Limite de % personagens por conta atingido', c_max_characters using errcode = 'P0001';
  end if;

  begin
    insert into public.characters (user_id, name, class_id)
    values (v_user, v_name, p_class_id)
    returning * into v_row;
  exception when unique_violation then
    raise exception 'Nome já está em uso' using errcode = '23505';
  end;

  return v_row;
end;
$$;

revoke all on function public.create_character(text, text) from public, anon;
grant execute on function public.create_character(text, text) to authenticated;
