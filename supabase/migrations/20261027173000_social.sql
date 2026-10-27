-- Fase 15: Salão de Treinamento (treino AFK), guildas, chat e ranking (GDD 7.1 e 17).
-- Treino: o servidor guarda quando começou; ao encerrar, conta os minutos pelo relógio dele (até o limite de horas)
-- e paga o XP. Enquanto treina, o personagem não sai da cidade (gatilho em explorations).
-- Guildas: fundar (custa cobre), entrar, sair e o líder remover membros; se o líder sai, o membro mais antigo assume.
-- Chat: canal geral e canal da guilda; o cliente lê pelo RLS (e pelo Realtime) e escreve só por chat_send.
-- Ranking: os maiores níveis e as guildas com mais níveis somados (nomes públicos, nada mais).
-- Regras vêm de content/social.json pela content_sync.

create table public.social_rules (
  id                        integer primary key check (id = 1),
  training_building         text not null,
  training_max_hours        integer not null check (training_max_hours between 1 and 24),
  training_rate_base_milli  integer not null check (training_rate_base_milli >= 0),
  training_rate_level_milli integer not null check (training_rate_level_milli >= 0),
  guild_building            text not null,
  guild_create_cost         integer not null check (guild_create_cost >= 0),
  guild_max_members         integer not null check (guild_max_members >= 2),
  guild_name_min            integer not null,
  guild_name_max            integer not null,
  guild_tag_min             integer not null,
  guild_tag_max             integer not null,
  chat_max_length           integer not null check (chat_max_length between 1 and 500),
  chat_cooldown_seconds     integer not null check (chat_cooldown_seconds >= 0),
  chat_keep_days            integer not null check (chat_keep_days >= 1),
  ranking_size              integer not null check (ranking_size between 1 and 100)
);
alter table public.social_rules enable row level security;
revoke all on public.social_rules from anon, authenticated;

-- Personagem do usuário (em qualquer lugar). Para o chat e para ler dados próprios.
create or replace function public.own_character(p_character_id uuid)
returns public.characters
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_char public.characters;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  select c.* into v_char from public.characters c where c.id = p_character_id and c.user_id = auth.uid();
  if v_char.id is null then
    raise exception 'Personagem não encontrado' using errcode = 'P0001';
  end if;
  return v_char;
end;
$$;
revoke all on function public.own_character(uuid) from public, anon, authenticated;

-- Texto sem caracteres de controle nem espaços sobrando (mesma regra de tidyText no cliente).
create or replace function public.tidy_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g'));
$$;
revoke all on function public.tidy_text(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Salão de Treinamento
-- ---------------------------------------------------------------------------
create table public.training_sessions (
  character_id uuid primary key references public.characters (id) on delete cascade,
  started_at   timestamptz not null default now(),
  -- nível no começo do treino (a taxa de XP não muda no meio)
  level        integer not null
);
alter table public.training_sessions enable row level security;
revoke all on public.training_sessions from anon, authenticated;

-- XP de um treino: minutos inteiros (até o limite) × taxa em milésimos (mesma regra de trainingXp no cliente).
create or replace function public.training_xp(p_level integer, p_started_at timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select least(floor(extract(epoch from (now() - p_started_at)) / 60)::bigint, r.training_max_hours * 60) as minutes,
           r.training_rate_base_milli + r.training_rate_level_milli * p_level as rate
    from public.social_rules r where r.id = 1
  )
  select jsonb_build_object('minutes', greatest(m.minutes, 0), 'xp', greatest(m.minutes, 0) * m.rate / 1000) from m;
$$;
revoke all on function public.training_xp(integer, timestamptz) from public, anon, authenticated;

create or replace function public.training_status(p_character_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char public.characters;
  v_s    public.training_sessions;
begin
  v_char := public.own_character(p_character_id);
  select s.* into v_s from public.training_sessions s where s.character_id = v_char.id;
  if v_s.character_id is null then
    return jsonb_build_object('training', false, 'now', now());
  end if;
  return jsonb_build_object('training', true, 'now', now(), 'started_at', v_s.started_at, 'level', v_s.level)
    || public.training_xp(v_s.level, v_s.started_at);
end;
$$;

create or replace function public.training_start(p_character_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char public.characters;
  v_at   timestamptz;
begin
  v_char := public.town_character(p_character_id);
  if exists (select 1 from public.training_sessions s where s.character_id = v_char.id) then
    raise exception 'Você já está treinando.' using errcode = 'P0001';
  end if;
  insert into public.training_sessions (character_id, level) values (v_char.id, v_char.level) returning started_at into v_at;
  return jsonb_build_object('training', true, 'now', now(), 'started_at', v_at, 'level', v_char.level, 'minutes', 0, 'xp', 0);
end;
$$;

create or replace function public.training_claim(p_character_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char  public.characters;
  v_s     public.training_sessions;
  v_gain  jsonb;
  v_xp    bigint;
  v_level integer;
begin
  v_char := public.town_character(p_character_id);
  delete from public.training_sessions s where s.character_id = v_char.id returning s.* into v_s;
  if v_s.character_id is null then
    raise exception 'Você não está treinando.' using errcode = 'P0001';
  end if;
  v_gain := public.training_xp(v_s.level, v_s.started_at);
  v_xp := (v_gain ->> 'xp')::bigint;
  select coalesce(max(t.level), 0) into v_level from public.level_thresholds t where t.total_xp <= v_char.xp + v_xp;
  update public.characters c set xp = c.xp + v_xp, level = greatest(c.level, v_level), updated_at = now() where c.id = v_char.id;
  return jsonb_build_object('minutes', (v_gain ->> 'minutes')::bigint, 'xp_gained', v_xp, 'xp', v_char.xp + v_xp,
    'level', greatest(v_char.level, v_level), 'leveled_up', v_level > v_char.level);
end;
$$;

-- Treinando, não sai da cidade (vale para qualquer forma de abrir uma exploração).
create or replace function public.explorations_block_training()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.training_sessions s where s.character_id = new.character_id) then
    raise exception 'Você está treinando no Salão. Encerre o treino para sair da cidade.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.explorations_block_training() from public, anon, authenticated;
create trigger explorations_block_training before insert on public.explorations
  for each row execute function public.explorations_block_training();

-- ---------------------------------------------------------------------------
-- Guildas
-- ---------------------------------------------------------------------------
create table public.guilds (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (name ~ '^[A-Za-zÀ-ÖØ-öø-ÿ0-9 ]+$'),
  tag        text not null check (tag ~ '^[A-Z0-9]+$'),
  created_at timestamptz not null default now()
);
create unique index guilds_name_unique_ci on public.guilds (lower(name));
create unique index guilds_tag_unique on public.guilds (tag);

-- Um personagem fica em no máximo uma guilda.
create table public.guild_members (
  character_id uuid primary key references public.characters (id) on delete cascade,
  guild_id     uuid not null references public.guilds (id) on delete cascade,
  role         text not null check (role in ('leader', 'member')),
  joined_at    timestamptz not null default now()
);
create index guild_members_guild on public.guild_members (guild_id, joined_at);
create unique index guild_members_one_leader on public.guild_members (guild_id) where role = 'leader';

alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
revoke all on public.guilds, public.guild_members from anon, authenticated;
-- Nome e sigla das guildas são públicos; os membros, só pelas funções (guild_info e ranking).
grant select on public.guilds to authenticated;
create policy "guilds: todos leem" on public.guilds for select to authenticated using (true);

-- Saiu o líder (por guild_leave ou personagem apagado): o membro mais antigo assume; sem membros, a guilda acaba.
create or replace function public.guild_members_succession()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next uuid;
begin
  if old.role <> 'leader' then
    return null;
  end if;
  select m.character_id into v_next from public.guild_members m
  where m.guild_id = old.guild_id order by m.joined_at, m.character_id limit 1;
  if v_next is null then
    delete from public.guilds g where g.id = old.guild_id;
  else
    update public.guild_members m set role = 'leader' where m.character_id = v_next;
  end if;
  return null;
end;
$$;
revoke all on function public.guild_members_succession() from public, anon, authenticated;
create trigger guild_members_succession after delete on public.guild_members
  for each row execute function public.guild_members_succession();

-- Guildas dos personagens do usuário (para o RLS do chat da guilda).
create or replace function public.my_guild_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.guild_id from public.guild_members m join public.characters c on c.id = m.character_id where c.user_id = auth.uid();
$$;
revoke all on function public.my_guild_ids() from public, anon;
grant execute on function public.my_guild_ids() to authenticated;

-- Lista de guildas (para entrar) e a guilda do personagem com os membros.
create or replace function public.guild_info(p_character_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char public.characters;
  v_mine public.guild_members;
  v_max  integer;
begin
  v_char := public.own_character(p_character_id);
  select r.guild_max_members into v_max from public.social_rules r where r.id = 1;
  select m.* into v_mine from public.guild_members m where m.character_id = v_char.id;
  return jsonb_build_object(
    'max_members', v_max,
    'mine', case when v_mine.guild_id is null then null else (
      select jsonb_build_object('id', g.id, 'name', g.name, 'tag', g.tag, 'role', v_mine.role, 'members',
        (select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'class_id', c.class_id, 'level', c.level, 'role', m.role)
                                   order by m.role = 'leader' desc, c.level desc, c.name), '[]'::jsonb)
         from public.guild_members m join public.characters c on c.id = m.character_id where m.guild_id = g.id))
      from public.guilds g where g.id = v_mine.guild_id) end,
    'guilds', (
      select coalesce(jsonb_agg(x order by (x ->> 'total_level')::integer desc, x ->> 'name'), '[]'::jsonb) from (
        select jsonb_build_object('id', g.id, 'name', g.name, 'tag', g.tag, 'members', count(*), 'total_level', sum(c.level)) as x
        from public.guilds g join public.guild_members m on m.guild_id = g.id join public.characters c on c.id = m.character_id
        group by g.id order by sum(c.level) desc, g.name limit 50) s));
end;
$$;

create or replace function public.guild_create(p_character_id uuid, p_name text, p_tag text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char public.characters;
  v_r    public.social_rules;
  v_name text := public.tidy_text(p_name);
  v_tag  text := upper(public.tidy_text(p_tag));
  v_id   uuid;
begin
  v_char := public.town_character(p_character_id);
  select r.* into v_r from public.social_rules r where r.id = 1;
  if exists (select 1 from public.guild_members m where m.character_id = v_char.id) then
    raise exception 'Saia da sua guilda antes de fundar outra.' using errcode = 'P0001';
  end if;
  if char_length(v_name) not between v_r.guild_name_min and v_r.guild_name_max then
    raise exception 'O nome da guilda precisa ter de % a % letras.', v_r.guild_name_min, v_r.guild_name_max using errcode = 'P0001';
  end if;
  if v_name !~ '^[A-Za-zÀ-ÖØ-öø-ÿ0-9 ]+$' then
    raise exception 'Use só letras, números e espaços no nome da guilda.' using errcode = 'P0001';
  end if;
  if char_length(v_tag) not between v_r.guild_tag_min and v_r.guild_tag_max then
    raise exception 'A sigla precisa ter de % a % letras.', v_r.guild_tag_min, v_r.guild_tag_max using errcode = 'P0001';
  end if;
  if v_tag !~ '^[A-Z0-9]+$' then
    raise exception 'Use só letras sem acento e números na sigla.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.guilds g where lower(g.name) = lower(v_name)) then
    raise exception 'Já existe uma guilda com esse nome.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.guilds g where g.tag = v_tag) then
    raise exception 'Já existe uma guilda com essa sigla.' using errcode = 'P0001';
  end if;
  if v_char.copper < v_r.guild_create_cost then
    raise exception 'Fundar uma guilda custa % de cobre.', v_r.guild_create_cost using errcode = 'P0001';
  end if;
  update public.characters c set copper = c.copper - v_r.guild_create_cost, updated_at = now() where c.id = v_char.id;
  insert into public.guilds (name, tag) values (v_name, v_tag) returning id into v_id;
  insert into public.guild_members (character_id, guild_id, role) values (v_char.id, v_id, 'leader');
  return jsonb_build_object('guild_id', v_id, 'name', v_name, 'tag', v_tag,
    'copper', v_char.copper - v_r.guild_create_cost, 'gold', v_char.gold);
exception
  when unique_violation then
    raise exception 'Já existe uma guilda com esse nome ou sigla.' using errcode = 'P0001';
end;
$$;

create or replace function public.guild_join(p_character_id uuid, p_guild_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char public.characters;
  v_g    public.guilds;
  v_max  integer;
begin
  v_char := public.town_character(p_character_id);
  if exists (select 1 from public.guild_members m where m.character_id = v_char.id) then
    raise exception 'Você já está numa guilda.' using errcode = 'P0001';
  end if;
  -- trava a guilda para contar os membros sem corrida
  select g.* into v_g from public.guilds g where g.id = p_guild_id for update;
  if v_g.id is null then
    raise exception 'Guilda não encontrada.' using errcode = 'P0001';
  end if;
  select r.guild_max_members into v_max from public.social_rules r where r.id = 1;
  if (select count(*) from public.guild_members m where m.guild_id = v_g.id) >= v_max then
    raise exception 'A guilda está cheia (% membros).', v_max using errcode = 'P0001';
  end if;
  insert into public.guild_members (character_id, guild_id, role) values (v_char.id, v_g.id, 'member');
  return jsonb_build_object('guild_id', v_g.id, 'name', v_g.name, 'tag', v_g.tag);
end;
$$;

create or replace function public.guild_leave(p_character_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char public.characters;
  v_m    public.guild_members;
begin
  v_char := public.town_character(p_character_id);
  select m.* into v_m from public.guild_members m where m.character_id = v_char.id;
  if v_m.guild_id is null then
    raise exception 'Você não está numa guilda.' using errcode = 'P0001';
  end if;
  perform 1 from public.guilds g where g.id = v_m.guild_id for update;
  delete from public.guild_members m where m.character_id = v_char.id;
end;
$$;

-- O líder remove um membro pelo nome do personagem.
create or replace function public.guild_kick(p_character_id uuid, p_member_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char   public.characters;
  v_me     public.guild_members;
  v_target uuid;
begin
  v_char := public.town_character(p_character_id);
  select m.* into v_me from public.guild_members m where m.character_id = v_char.id;
  if v_me.role is distinct from 'leader' then
    raise exception 'Só o líder pode remover membros.' using errcode = 'P0001';
  end if;
  select m.character_id into v_target from public.guild_members m join public.characters c on c.id = m.character_id
  where m.guild_id = v_me.guild_id and lower(c.name) = lower(p_member_name);
  if v_target is null then
    raise exception 'Esse personagem não é da sua guilda.' using errcode = 'P0001';
  end if;
  if v_target = v_char.id then
    raise exception 'Para sair, use "Sair da guilda".' using errcode = 'P0001';
  end if;
  delete from public.guild_members m where m.character_id = v_target;
end;
$$;

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------
create table public.chat_messages (
  id           bigint generated always as identity primary key,
  -- null: canal geral
  guild_id     uuid references public.guilds (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  character_id uuid references public.characters (id) on delete set null,
  author       text not null,
  body         text not null check (char_length(body) between 1 and 500),
  created_at   timestamptz not null default now()
);
create index chat_messages_channel on public.chat_messages (guild_id, created_at desc);
create index chat_messages_user on public.chat_messages (user_id, created_at desc);
create index chat_messages_created on public.chat_messages (created_at);

alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;
grant select on public.chat_messages to authenticated;
create policy "chat_messages: geral para todos, guilda só para os membros"
  on public.chat_messages for select
  to authenticated
  using (guild_id is null or guild_id in (select public.my_guild_ids()));

-- Realtime: novas mensagens chegam aos clientes inscritos (o Realtime aplica o mesmo RLS).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;

create or replace function public.chat_send(p_character_id uuid, p_channel text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_char  public.characters;
  v_r     public.social_rules;
  v_body  text := public.tidy_text(p_body);
  v_guild uuid;
  v_row   public.chat_messages;
begin
  v_char := public.own_character(p_character_id);
  select r.* into v_r from public.social_rules r where r.id = 1;
  if v_body = '' then
    raise exception 'Mensagem vazia.' using errcode = 'P0001';
  end if;
  if char_length(v_body) > v_r.chat_max_length then
    raise exception 'A mensagem passa de % caracteres.', v_r.chat_max_length using errcode = 'P0001';
  end if;
  if p_channel = 'guild' then
    select m.guild_id into v_guild from public.guild_members m where m.character_id = v_char.id;
    if v_guild is null then
      raise exception 'Você não está numa guilda.' using errcode = 'P0001';
    end if;
  elsif p_channel is distinct from 'global' then
    raise exception 'Canal desconhecido.' using errcode = 'P0001';
  end if;
  -- uma mensagem por vez por conta (trava evita duas ao mesmo tempo)
  perform pg_advisory_xact_lock(hashtext('chat:' || v_char.user_id::text));
  if exists (select 1 from public.chat_messages c
             where c.user_id = v_char.user_id and c.created_at > now() - make_interval(secs => v_r.chat_cooldown_seconds)) then
    raise exception 'Espere um pouco antes de mandar outra mensagem.' using errcode = 'P0001';
  end if;
  insert into public.chat_messages (guild_id, user_id, character_id, author, body)
  values (v_guild, v_char.user_id, v_char.id, v_char.name, v_body) returning * into v_row;
  delete from public.chat_messages c where c.created_at < now() - make_interval(days => v_r.chat_keep_days);
  return jsonb_build_object('id', v_row.id, 'guild_id', v_row.guild_id, 'author', v_row.author, 'body', v_row.body, 'created_at', v_row.created_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- Ranking (público: nome, classe, nível e sigla da guilda)
-- ---------------------------------------------------------------------------
create or replace function public.ranking()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_size integer;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  select r.ranking_size into v_size from public.social_rules r where r.id = 1;
  return jsonb_build_object(
    'players', (
      select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) from (
        select row_number() over (order by c.level desc, c.xp desc, c.created_at) as ord,
               jsonb_build_object('name', c.name, 'class_id', c.class_id, 'level', c.level, 'xp', c.xp, 'guild_tag', g.tag) as x
        from public.characters c
        left join public.guild_members m on m.character_id = c.id
        left join public.guilds g on g.id = m.guild_id
        order by c.level desc, c.xp desc, c.created_at limit v_size) p),
    'guilds', (
      select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) from (
        select row_number() over (order by sum(c.level) desc, count(*) desc, g.name) as ord,
               jsonb_build_object('name', g.name, 'tag', g.tag, 'members', count(*), 'total_level', sum(c.level)) as x
        from public.guilds g join public.guild_members m on m.guild_id = g.id join public.characters c on c.id = m.character_id
        group by g.id order by sum(c.level) desc, count(*) desc, g.name limit v_size) q));
end;
$$;

revoke all on function public.training_status(uuid), public.training_start(uuid), public.training_claim(uuid),
  public.guild_info(uuid), public.guild_create(uuid, text, text), public.guild_join(uuid, uuid), public.guild_leave(uuid),
  public.guild_kick(uuid, text), public.chat_send(uuid, text, text), public.ranking() from public, anon;
grant execute on function public.training_status(uuid), public.training_start(uuid), public.training_claim(uuid),
  public.guild_info(uuid), public.guild_create(uuid, text, text), public.guild_join(uuid, uuid), public.guild_leave(uuid),
  public.guild_kick(uuid, text), public.chat_send(uuid, text, text), public.ranking() to authenticated;
