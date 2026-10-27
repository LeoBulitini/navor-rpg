-- Testes (pgTAP) das classes iniciais jogáveis (Fase 8).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(5);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'c@test.local');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);

select is((select array_agg(id order by id) from public.classes where playable and unlock_level = 0),
  array['archer', 'mage', 'warrior'], 'Mago, Guerreiro e Arqueiro são as classes iniciais');
select lives_ok($$ select public.create_character('Gunnar', 'warrior') $$, 'cria um Guerreiro');
select lives_ok($$ select public.create_character('Lyra', 'archer') $$, 'cria um Arqueiro');
select throws_ok($$ select public.create_character('Ezra', 'swordsman') $$, '22023', null, 'Espadachim (nível 25) não é criado direto');
select is((select array_agg(class_id order by name) from public.characters), array['warrior', 'archer'], 'os dois personagens com a classe certa');

select * from finish();
rollback;
