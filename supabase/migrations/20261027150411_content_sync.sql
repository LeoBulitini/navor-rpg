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

insert into public.exploration_areas (id, nodes_min, nodes_max, expires_minutes, collect_cooldown_ms, max_starts_per_minute, monsters_min, monsters_max) values
  ('cave', 8, 12, 30, 500, 10, 4, 6)
on conflict (id) do update set nodes_min = excluded.nodes_min, nodes_max = excluded.nodes_max,
  expires_minutes = excluded.expires_minutes, collect_cooldown_ms = excluded.collect_cooldown_ms,
  max_starts_per_minute = excluded.max_starts_per_minute, monsters_min = excluded.monsters_min, monsters_max = excluded.monsters_max;

insert into public.area_rarity_rules (area_id, rarity, weight, qty_min, qty_max) values
  ('cave', 'common', 70, 1, 3),
  ('cave', 'uncommon', 25, 1, 2),
  ('cave', 'rare', 5, 1, 1)
on conflict (area_id, rarity) do update set weight = excluded.weight, qty_min = excluded.qty_min, qty_max = excluded.qty_max;

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
  ('cave', 'quartz')
on conflict (area_id, item_id) do nothing;

insert into public.creatures (id, name, hp, xp, copper_min, copper_max) values
  ('cave-rat', 'Rato das Cavernas', 18, 8, 0, 2),
  ('goblin-raider', 'Goblin Saqueador', 42, 22, 2, 6)
on conflict (id) do update set name = excluded.name, hp = excluded.hp, xp = excluded.xp,
  copper_min = excluded.copper_min, copper_max = excluded.copper_max;

insert into public.creature_drops (creature_id, item_id, chance, qty_min, qty_max) values
  ('cave-rat', 'rat-pelt', 0.5, 1, 1),
  ('goblin-raider', 'goblin-fangs', 0.4, 1, 2)
on conflict (creature_id, item_id) do update set chance = excluded.chance, qty_min = excluded.qty_min, qty_max = excluded.qty_max;

insert into public.area_creatures (area_id, creature_id, weight) values
  ('cave', 'cave-rat', 70),
  ('cave', 'goblin-raider', 30)
on conflict (area_id, creature_id) do update set weight = excluded.weight;

insert into public.level_thresholds (level, total_xp) values
  (0, 0),
  (1, 40),
  (2, 161),
  (3, 393),
  (4, 761),
  (5, 1286),
  (6, 1989),
  (7, 2889),
  (8, 4003),
  (9, 5348),
  (10, 6940),
  (11, 8795),
  (12, 10927),
  (13, 13350),
  (14, 16078),
  (15, 19125),
  (16, 22503),
  (17, 26225),
  (18, 30303),
  (19, 34750),
  (20, 39577),
  (21, 44796),
  (22, 50419),
  (23, 56456),
  (24, 62918),
  (25, 69817),
  (26, 77162),
  (27, 84965),
  (28, 93235),
  (29, 101983),
  (30, 111218),
  (31, 120951),
  (32, 131191),
  (33, 141948),
  (34, 153231),
  (35, 165050),
  (36, 177414),
  (37, 190332),
  (38, 203813),
  (39, 217866),
  (40, 232500),
  (41, 247723),
  (42, 263545),
  (43, 279974),
  (44, 297019),
  (45, 314688),
  (46, 332989),
  (47, 351931),
  (48, 371522),
  (49, 391770),
  (50, 412683),
  (51, 434269),
  (52, 456536),
  (53, 479492),
  (54, 503145),
  (55, 527503),
  (56, 552573),
  (57, 578363),
  (58, 604881),
  (59, 632135),
  (60, 660131),
  (61, 688878),
  (62, 718382),
  (63, 748651),
  (64, 779693),
  (65, 811515),
  (66, 844123),
  (67, 877526),
  (68, 911730),
  (69, 946742),
  (70, 982570),
  (71, 1019220),
  (72, 1056699),
  (73, 1095015),
  (74, 1134174),
  (75, 1174183)
on conflict (level) do update set total_xp = excluded.total_xp;

insert into public.combat_rules (id, max_dps_base, max_dps_per_level) values
  (1, 60, 8)
on conflict (id) do update set max_dps_base = excluded.max_dps_base, max_dps_per_level = excluded.max_dps_per_level;
