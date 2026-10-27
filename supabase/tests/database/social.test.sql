-- Testes (pgTAP) do Salão de Treinamento, das guildas, do chat e do ranking: XP pelo relógio do servidor com limite,
-- treino prende na cidade, guilda com custo, nomes únicos, líder sucessor, chat da guilda só para membros e intervalo.
-- Rodar com Supabase local:      npx supabase test db
-- Rodar sem Docker (Postgres 16): npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(36);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test.local');

reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select public.create_character('Aldric', 'mage');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select public.create_character('Brena', 'archer');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select public.create_character('Cedric', 'warrior');
reset role;
create temp table t (k text primary key, v text);
grant all on t to authenticated;
insert into t select 'a', id::text from public.characters where name = 'Aldric';
insert into t select 'b', id::text from public.characters where name = 'Brena';
insert into t select 'c', id::text from public.characters where name = 'Cedric';
create function pg_temp.c(k text) returns uuid language sql as $$ select v::uuid from t where t.k = c.k $$;
grant execute on function pg_temp.c(text) to authenticated;
update public.characters set level = 10, xp = (select total_xp from public.level_thresholds where level = 10) where name = 'Aldric';
insert into t select 'xp10', total_xp::text from public.level_thresholds where level = 10;
update public.characters set copper = 1500 where name in ('Aldric', 'Brena');
update public.characters set level = 3 where name = 'Cedric';

select ok(bool_and(relrowsecurity), 'RLS ativo nas tabelas sociais')
from pg_class where oid in ('public.social_rules'::regclass, 'public.training_sessions'::regclass, 'public.guilds'::regclass,
  'public.guild_members'::regclass, 'public.chat_messages'::regclass);

-- Treino (A, nível 10)
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((public.training_status(pg_temp.c('a')) ->> 'training')::boolean, false, 'sem treino aberto no começo');
select is((public.training_start(pg_temp.c('a')) ->> 'level')::integer, 10, 'começa o treino no nível 10');
select throws_ok($$ select public.training_start(pg_temp.c('a')) $$, 'P0001', 'Você já está treinando.', 'não abre dois treinos');
select throws_ok($$ select public.start_exploration(pg_temp.c('a'), 'cave') $$, 'P0001',
  'Você está treinando no Salão. Encerre o treino para sair da cidade.', 'treinando, não sai da cidade');
reset role;
update public.training_sessions set started_at = now() - interval '90 minutes 30 seconds' where character_id = pg_temp.c('a');
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((public.training_status(pg_temp.c('a')) ->> 'minutes')::integer, 90, 'o status conta 90 minutos inteiros');
select is((public.training_status(pg_temp.c('a')) ->> 'xp')::integer, 450, '90 min × (1 + 0,4 × 10) = 450 XP');
select is((public.training_claim(pg_temp.c('a')) ->> 'xp_gained')::integer, 450, 'encerrar paga 450 XP');
select throws_ok($$ select public.training_claim(pg_temp.c('a')) $$, 'P0001', 'Você não está treinando.', 'não paga duas vezes');
select is((select xp from public.characters where id = pg_temp.c('a')) - (select v::bigint from t where k = 'xp10'), 450::bigint,
  'o XP foi gravado no personagem');
select lives_ok($$ select public.training_start(pg_temp.c('a')) $$, 'treina de novo');
reset role;
update public.training_sessions set started_at = now() - interval '30 hours' where character_id = pg_temp.c('a');
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((public.training_claim(pg_temp.c('a')) ->> 'minutes')::integer, 480, 'o treino para de contar em 8 horas');
select throws_ok($$ select public.training_start(pg_temp.c('b')) $$, 'P0001', 'Personagem não encontrado', 'A não treina o personagem de B');
select throws_ok($$ select count(*) from public.training_sessions $$, '42501', null, 'o cliente não lê as sessões de treino direto');

-- Guildas
select throws_ok($$ select public.guild_create(pg_temp.c('a'), 'ab', 'AB') $$, 'P0001', 'O nome da guilda precisa ter de 3 a 20 letras.', 'nome curto é recusado');
select throws_ok($$ select public.guild_create(pg_temp.c('a'), 'Guilda <b>', 'AB') $$, 'P0001', 'Use só letras, números e espaços no nome da guilda.', 'nome com símbolo é recusado');
select is((public.guild_create(pg_temp.c('a'), '  Ordem   do Leão ', 'leao') ->> 'copper')::integer, 500, 'fundar custa 1000 de cobre');
select is((select name || '/' || tag from public.guilds), 'Ordem do Leão/LEAO', 'nome limpo e sigla em maiúsculas');
select throws_ok($$ select public.guild_create(pg_temp.c('a'), 'Outra', 'OUT') $$, 'P0001', 'Saia da sua guilda antes de fundar outra.', 'um personagem, uma guilda');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok($$ select public.guild_create(pg_temp.c('b'), 'ordem do leão', 'XYZ') $$, 'P0001', 'Já existe uma guilda com esse nome.', 'nome repetido (sem diferença de maiúsculas)');
select is((select count(*) from public.guilds), 1::bigint, 'todos leem as guildas');
select throws_ok($$ select count(*) from public.guild_members $$, '42501', null, 'membros não são lidos direto');
select lives_ok($$ select public.guild_join(pg_temp.c('b'), (select id from public.guilds)) $$, 'B entra na guilda');
select is(jsonb_array_length(public.guild_info(pg_temp.c('b')) -> 'mine' -> 'members'), 2, 'B vê os dois membros');
select is(public.guild_info(pg_temp.c('b')) -> 'mine' -> 'members' -> 0 ->> 'name', 'Aldric', 'o líder vem primeiro');
select throws_ok($$ select public.guild_kick(pg_temp.c('b'), 'Aldric') $$, 'P0001', 'Só o líder pode remover membros.', 'membro não remove ninguém');

-- Chat
select is(public.chat_send(pg_temp.c('b'), 'guild', '  oi   guilda ') ->> 'body', 'oi guilda', 'mensagem na guilda, com espaços limpos');
select throws_ok($$ select public.chat_send(pg_temp.c('b'), 'global', 'oi todos') $$, 'P0001', 'Espere um pouco antes de mandar outra mensagem.', 'intervalo entre mensagens');
reset role;
update public.chat_messages set created_at = now() - interval '1 minute';
set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select lives_ok($$ select public.chat_send(pg_temp.c('b'), 'global', 'oi todos') $$, 'depois do intervalo, manda no geral');
select throws_ok($$ select public.chat_send(pg_temp.c('b'), 'global', repeat('a', 201)) $$, 'P0001', 'A mensagem passa de 200 caracteres.', 'mensagem longa é recusada');
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select is((select count(*) from public.chat_messages), 1::bigint, 'quem não é da guilda só lê o canal geral');
select throws_ok($$ select public.chat_send(pg_temp.c('c'), 'guild', 'oi') $$, 'P0001', 'Você não está numa guilda.', 'sem guilda, não manda no canal dela');
select is(public.ranking() -> 'players' -> 0 ->> 'name', 'Aldric', 'o ranking começa pelo maior nível');
select is(public.ranking() -> 'guilds' -> 0 ->> 'tag', 'LEAO', 'o ranking de guildas soma os níveis');

-- Líder sai: o mais antigo assume; o último a sair acaba com a guilda
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select public.guild_leave(pg_temp.c('a'));
reset role; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is(public.guild_info(pg_temp.c('b')) -> 'mine' ->> 'role', 'leader', 'quando o líder sai, B vira líder');
select public.guild_leave(pg_temp.c('b'));
reset role;
select is((select count(*) from public.guilds), 0::bigint, 'sem membros, a guilda acaba (e o chat dela junto)');

select * from finish();
rollback;
