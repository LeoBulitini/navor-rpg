-- SOMENTE PARA TESTES FORA DO SUPABASE (Postgres puro, ex.: CI sem Docker).
-- Recria o mínimo do Supabase de que as migrations e os testes dependem:
-- papéis anon/authenticated/service_role, a tabela auth.users e auth.uid()
-- lendo o JWT da sessão (request.jwt.claims), como no Supabase real.
-- No Supabase de verdade (`npx supabase test db`) este arquivo NÃO é usado.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    ), ''
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- No Supabase as extensões (pgtap etc.) ficam no schema "extensions", acessível aos papéis da API.
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
alter default privileges in schema extensions grant execute on functions to anon, authenticated, service_role;
