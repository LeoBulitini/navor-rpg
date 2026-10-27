-- GERADO por scripts/db-content.ts a partir de content/. Não edite à mão: rode `npm run db:content`.

insert into public.items (id, name, rarity, category) values
  ('iron', 'Ferro', 'common', 'ore'),
  ('copper', 'Cobre', 'common', 'ore'),
  ('coal', 'Carvão', 'common', 'ore'),
  ('silver', 'Prata', 'uncommon', 'ore'),
  ('aluminum', 'Alumínio', 'uncommon', 'ore'),
  ('gold-ore', 'Ouro (minério)', 'rare', 'ore'),
  ('quartz', 'Quartzo', 'rare', 'ore'),
  ('mithril', 'Mithril', 'epic', 'ore'),
  ('adamantite-ore', 'Minério de Adamantita', 'legendary', 'ore'),
  ('scroll-simple', 'Pergaminho Simples', 'common', 'scroll'),
  ('scroll-improved', 'Pergaminho Aprimorado', 'uncommon', 'scroll'),
  ('scroll-rare', 'Pergaminho Raro', 'rare', 'scroll'),
  ('scroll-ancient', 'Pergaminho Ancestral', 'epic', 'scroll'),
  ('scroll-legendary', 'Pergaminho Lendário', 'legendary', 'scroll'),
  ('scroll-forbidden', 'Pergaminho Proibido', 'shadow', 'scroll'),
  ('mushroom-common', 'Cogumelo Comum', 'common', 'resource'),
  ('bones', 'Ossos', 'common', 'resource'),
  ('rat-pelt', 'Pele de Rato', 'common', 'resource'),
  ('mushroom-medicinal', 'Cogumelo Medicinal', 'uncommon', 'resource'),
  ('goblin-fangs', 'Presas de Goblin', 'uncommon', 'resource'),
  ('bat-chitin', 'Quitina de Morcego', 'uncommon', 'resource'),
  ('crystal-blue', 'Cristal Azul', 'rare', 'resource'),
  ('monster-essence', 'Essência de Monstro', 'rare', 'resource'),
  ('ancient-bone', 'Osso Antigo', 'rare', 'resource'),
  ('mushroom-arcane', 'Cogumelo Arcano', 'epic', 'resource'),
  ('crystal-violet', 'Cristal Violeta', 'epic', 'resource'),
  ('ancient-crystal-core', 'Núcleo de Cristal Ancestral', 'legendary', 'resource'),
  ('shadow-essence', 'Essência Sombria', 'shadow', 'resource'),
  ('wood-common', 'Madeira Comum', 'common', 'resource'),
  ('wild-berries', 'Frutas Silvestres', 'common', 'resource'),
  ('leather-simple', 'Couro Simples', 'common', 'resource'),
  ('medicinal-herbs', 'Ervas Medicinais', 'uncommon', 'resource'),
  ('wood-sturdy', 'Madeira Resistente', 'uncommon', 'resource'),
  ('boar-tusks', 'Presas de Javali', 'uncommon', 'resource'),
  ('blue-flower', 'Flor Azul', 'rare', 'resource'),
  ('wood-ancient', 'Madeira Ancestral', 'rare', 'resource'),
  ('wolf-pelt', 'Pele de Lobo', 'rare', 'resource'),
  ('arcane-flower', 'Flor Arcana', 'epic', 'resource'),
  ('wood-enchanted', 'Madeira Encantada', 'epic', 'resource'),
  ('sun-flower', 'Flor Solar', 'legendary', 'resource'),
  ('shadow-root', 'Raiz Sombria', 'shadow', 'resource')
on conflict (id) do update set name = excluded.name, rarity = excluded.rarity, category = excluded.category;

insert into public.exploration_areas (id, nodes_min, nodes_max, expires_minutes, collect_cooldown_ms, max_starts_per_minute) values
  ('cave', 8, 12, 30, 500, 10)
on conflict (id) do update set nodes_min = excluded.nodes_min, nodes_max = excluded.nodes_max,
  expires_minutes = excluded.expires_minutes, collect_cooldown_ms = excluded.collect_cooldown_ms,
  max_starts_per_minute = excluded.max_starts_per_minute;

delete from public.area_rarity_rules where area_id in ('cave');
insert into public.area_rarity_rules (area_id, rarity, weight, qty_min, qty_max) values
  ('cave', 'common', 70, 1, 3),
  ('cave', 'uncommon', 25, 1, 2),
  ('cave', 'rare', 5, 1, 1);

delete from public.area_items where area_id in ('cave');
insert into public.area_items (area_id, item_id) values
  ('cave', 'mushroom-common'),
  ('cave', 'bones'),
  ('cave', 'iron'),
  ('cave', 'copper'),
  ('cave', 'coal'),
  ('cave', 'mushroom-medicinal'),
  ('cave', 'silver'),
  ('cave', 'aluminum'),
  ('cave', 'crystal-blue'),
  ('cave', 'ancient-bone'),
  ('cave', 'gold-ore'),
  ('cave', 'quartz');
