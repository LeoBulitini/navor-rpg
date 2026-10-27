import { levelThresholds, type Content } from '../src/index.ts';

/** Marca as migrations geradas por `npm run db:content`. */
export const CONTENT_SYNC_SUFFIX = '_content_sync.sql';

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * SQL que copia para o banco os dados de content/ que o servidor usa para validar a coleta:
 * itens, regras das áreas, pesos das raridades, itens de cada área, baús, monstros e o que soltam, monstros
 * de cada área, tabela de XP por nível e o teto de dano por segundo. Pode rodar várias vezes.
 * Só insere e atualiza, nunca apaga: itens porque o inventário aponta para eles; e tirar uma
 * raridade ou um item de uma área exige uma migration escrita à mão com o `delete`.
 */
export function contentSql(content: Content): string {
  const items = content.items.items
    .map((i) => `  (${q(i.id)}, ${q(i.name)}, ${q(i.rarity)}, ${q(i.category)})`)
    .join(',\n');
  const areas = content.procedural.areas.filter((a) => a.resources);
  const lines = [
    '-- GERADO por scripts/db-content.ts a partir de content/. Não edite à mão: rode `npm run db:content`.',
    '',
    'insert into public.items (id, name, rarity, category) values',
    `${items}`,
    'on conflict (id) do update set name = excluded.name, rarity = excluded.rarity, category = excluded.category;',
  ];
  if (areas.length > 0) {
    const areaRows = areas
      .map((a) => {
        const r = a.resources!;
        const m = a.creatures?.count ?? { min: 0, max: 0 };
        return `  (${q(a.id)}, ${r.nodes.min}, ${r.nodes.max}, ${r.expiresMinutes}, ${r.collectCooldownMs}, ${r.maxStartsPerMinute}, ${m.min}, ${m.max})`;
      })
      .join(',\n');
    const ruleRows = areas
      .flatMap((a) => a.resources!.rarities.map((r) => `  (${q(a.id)}, ${q(r.rarity)}, ${r.weight}, ${r.quantity.min}, ${r.quantity.max})`))
      .join(',\n');
    const itemRows = areas.flatMap((a) => a.resources!.items.map((id) => `  (${q(a.id)}, ${q(id)})`)).join(',\n');
    lines.push(
      '',
      'insert into public.exploration_areas (id, nodes_min, nodes_max, expires_minutes, collect_cooldown_ms, max_starts_per_minute, monsters_min, monsters_max) values',
      areaRows,
      'on conflict (id) do update set nodes_min = excluded.nodes_min, nodes_max = excluded.nodes_max,',
      '  expires_minutes = excluded.expires_minutes, collect_cooldown_ms = excluded.collect_cooldown_ms,',
      '  max_starts_per_minute = excluded.max_starts_per_minute, monsters_min = excluded.monsters_min, monsters_max = excluded.monsters_max;',
      '',
      'insert into public.area_rarity_rules (area_id, rarity, weight, qty_min, qty_max) values',
      ruleRows,
      'on conflict (area_id, rarity) do update set weight = excluded.weight, qty_min = excluded.qty_min, qty_max = excluded.qty_max;',
      '',
      'insert into public.area_items (area_id, item_id) values',
      itemRows,
      'on conflict (area_id, item_id) do nothing;',
    );
  }

  const chestAreas = areas.filter((a) => a.chests);
  if (chestAreas.length > 0) {
    const chestItems = chestAreas.flatMap((a) =>
      a.chests!.items.map((x) => `  (${q(a.id)}, ${q(x.item)}, ${x.chance}, ${x.quantity.min}, ${x.quantity.max})`),
    );
    lines.push(
      '',
      'insert into public.area_chest_rules (area_id, chests_min, chests_max, copper_min, copper_max, gold_chance, min_seconds) values',
      chestAreas
        .map((a) => {
          const c = a.chests!;
          return `  (${q(a.id)}, ${c.count.min}, ${c.count.max}, ${c.copper.min}, ${c.copper.max}, ${c.goldChance}, ${c.minSecondsAfterStart})`;
        })
        .join(',\n'),
      'on conflict (area_id) do update set chests_min = excluded.chests_min, chests_max = excluded.chests_max,',
      '  copper_min = excluded.copper_min, copper_max = excluded.copper_max, gold_chance = excluded.gold_chance, min_seconds = excluded.min_seconds;',
    );
    if (chestItems.length > 0) {
      lines.push(
        '',
        'insert into public.area_chest_items (area_id, item_id, chance, qty_min, qty_max) values',
        chestItems.join(',\n'),
        'on conflict (area_id, item_id) do update set chance = excluded.chance, qty_min = excluded.qty_min, qty_max = excluded.qty_max;',
      );
    }
  }

  const creatures = content.creatures.creatures;
  const drops = creatures.flatMap((c) => c.drops.map((d) => `  (${q(c.id)}, ${q(d.item)}, ${d.chance}, ${d.quantity.min}, ${d.quantity.max})`));
  const spawns = content.procedural.areas.flatMap((a) => (a.creatures?.spawn ?? []).map((x) => `  (${q(a.id)}, ${q(x.creature)}, ${x.weight})`));
  const thresholds = levelThresholds(content.progression.xpCurve, content.classes.maxLevel);
  const dps = content.combat.server.maxDamagePerSecond;
  lines.push(
    '',
    'insert into public.creatures (id, name, hp, xp, copper_min, copper_max) values',
    creatures.map((c) => `  (${q(c.id)}, ${q(c.name)}, ${c.stats.hp}, ${c.xp}, ${c.copper.min}, ${c.copper.max})`).join(',\n'),
    'on conflict (id) do update set name = excluded.name, hp = excluded.hp, xp = excluded.xp,',
    '  copper_min = excluded.copper_min, copper_max = excluded.copper_max;',
  );
  if (drops.length > 0) {
    lines.push(
      '',
      'insert into public.creature_drops (creature_id, item_id, chance, qty_min, qty_max) values',
      drops.join(',\n'),
      'on conflict (creature_id, item_id) do update set chance = excluded.chance, qty_min = excluded.qty_min, qty_max = excluded.qty_max;',
    );
  }
  if (spawns.length > 0) {
    lines.push(
      '',
      'insert into public.area_creatures (area_id, creature_id, weight) values',
      spawns.join(',\n'),
      'on conflict (area_id, creature_id) do update set weight = excluded.weight;',
    );
  }
  lines.push(
    '',
    'insert into public.level_thresholds (level, total_xp) values',
    thresholds.map((xp, level) => `  (${level}, ${xp})`).join(',\n'),
    'on conflict (level) do update set total_xp = excluded.total_xp;',
    '',
    'insert into public.combat_rules (id, max_dps_base, max_dps_per_level) values',
    `  (1, ${dps.base}, ${dps.perLevel})`,
    'on conflict (id) do update set max_dps_base = excluded.max_dps_base, max_dps_per_level = excluded.max_dps_per_level;',
  );
  return `${lines.join('\n')}\n`;
}
