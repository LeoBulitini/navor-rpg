-- Fase 15 (parte 2): liga a sucessão do líder às saídas da guilda (left_at) e aos personagens que deixam de existir.

create trigger guild_members_succession after update of left_at or delete on public.guild_members
  for each row execute function public.guild_members_succession();
