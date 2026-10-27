import { gradeCost, itemValue, levelThresholds, maxGrade, shopBuys, type Content, type SkillDef } from '../src/index.ts';

/** Marca as migrations geradas por `npm run db:content`. */
export const CONTENT_SYNC_SUFFIX = '_content_sync.sql';

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * SQL que copia para o banco os dados de content/ que o servidor usa para validar a coleta:
 * itens (com valor e efeito de uso), regras das áreas, pesos das raridades, itens de cada área, baús, monstros
 * e o que soltam, monstros de cada área, lojas, equipamentos, receitas, habilidades, evolução de classe, missões diárias, tabela de XP por nível e o teto de dano por segundo. Pode rodar várias vezes.
 * Só insere e atualiza, nunca apaga: itens porque o inventário aponta para eles; e tirar uma
 * raridade ou um item de uma área exige uma migration escrita à mão com o `delete`.
 */
export function contentSql(content: Content): string {
  const items = content.items.items
    .map(
      (i) =>
        `  (${q(i.id)}, ${q(i.name)}, ${q(i.rarity)}, ${q(i.category)}, ${itemValue(i, content.rarities)}, ${i.use?.hp ?? 0}, ${i.use?.mana ?? 0}, ${i.gather ? q(i.gather) : 'null'})`,
    )
    .join(',\n');
  const areas = content.procedural.areas.filter((a) => a.resources);
  const lines = [
    '-- GERADO por scripts/db-content.ts a partir de content/. Não edite à mão: rode `npm run db:content`.',
    '',
    'insert into public.items (id, name, rarity, category, value, use_hp, use_mana, gather_tool) values',
    `${items}`,
    'on conflict (id) do update set name = excluded.name, rarity = excluded.rarity, category = excluded.category,',
    '  value = excluded.value, use_hp = excluded.use_hp, use_mana = excluded.use_mana, gather_tool = excluded.gather_tool;',
  ];
  const gear = content.items.items.filter((i) => i.equip);
  if (gear.length > 0) {
    lines.push(
      '',
      'insert into public.item_equip (item_id, slot, paths, tool_tier, upgrade_item_id, hp, mana, phys_attack, mag_attack, phys_defense, mag_defense, precision_bonus) values',
      gear
        .map((i) => {
          const e = i.equip!;
          const st = e.stats;
          const paths = e.paths ? `array[${e.paths.map(q).join(', ')}]` : 'null';
          return `  (${q(i.id)}, ${q(e.slot)}, ${paths}, ${e.toolTier ?? 'null'}, ${e.upgradeMaterial ? q(e.upgradeMaterial) : 'null'}, ${st.hp}, ${st.mana}, ${st.physAttack}, ${st.magAttack}, ${st.physDefense}, ${st.magDefense}, ${st.precision})`;
        })
        .join(',\n'),
      'on conflict (item_id) do update set slot = excluded.slot, paths = excluded.paths, tool_tier = excluded.tool_tier,',
      '  upgrade_item_id = excluded.upgrade_item_id, hp = excluded.hp, mana = excluded.mana, phys_attack = excluded.phys_attack,',
      '  mag_attack = excluded.mag_attack, phys_defense = excluded.phys_defense, mag_defense = excluded.mag_defense, precision_bonus = excluded.precision_bonus;',
    );
  }
  const eq = content.equipment;
  lines.push(
    '',
    'insert into public.equipment_rules (id, stat_percent_per_level, max_pieces, sell_bonus_per_upgrade) values',
    `  (1, ${eq.upgrade.statPercentPerLevel}, ${eq.maxPieces}, ${eq.sellBonusPerUpgrade})`,
    'on conflict (id) do update set stat_percent_per_level = excluded.stat_percent_per_level, max_pieces = excluded.max_pieces,',
    '  sell_bonus_per_upgrade = excluded.sell_bonus_per_upgrade;',
    '',
    'insert into public.upgrade_costs (level, copper, gold, materials) values',
    eq.upgrade.costs.map((c, i) => `  (${i + 1}, ${c.copper}, ${c.gold}, ${c.materials})`).join(',\n'),
    'on conflict (level) do update set copper = excluded.copper, gold = excluded.gold, materials = excluded.materials;',
  );
  const tiers = Object.entries(eq.gatherTiers);
  if (tiers.length > 0) {
    lines.push(
      '',
      'insert into public.gather_tiers (rarity, tier) values',
      tiers.map(([r, t]) => `  (${q(r)}, ${t})`).join(',\n'),
      'on conflict (rarity) do update set tier = excluded.tier;',
    );
  }
  if (areas.length > 0) {
    const areaRows = areas
      .map((a) => {
        const r = a.resources!;
        const m = a.creatures?.count ?? { min: 0, max: 0 };
        return `  (${q(a.id)}, ${r.nodes.min}, ${r.nodes.max}, ${r.expiresMinutes}, ${r.collectCooldownMs}, ${r.maxStartsPerMinute}, ${m.min}, ${m.max}, ${a.daily}, ${a.minLevel})`;
      })
      .join(',\n');
    const ruleRows = areas
      .flatMap((a) => a.resources!.rarities.map((r) => `  (${q(a.id)}, ${q(r.rarity)}, ${r.weight}, ${r.quantity.min}, ${r.quantity.max})`))
      .join(',\n');
    const itemRows = areas.flatMap((a) => a.resources!.items.map((id) => `  (${q(a.id)}, ${q(id)})`)).join(',\n');
    lines.push(
      '',
      'insert into public.exploration_areas (id, nodes_min, nodes_max, expires_minutes, collect_cooldown_ms, max_starts_per_minute, monsters_min, monsters_max, daily, min_level) values',
      areaRows,
      'on conflict (id) do update set nodes_min = excluded.nodes_min, nodes_max = excluded.nodes_max,',
      '  expires_minutes = excluded.expires_minutes, collect_cooldown_ms = excluded.collect_cooldown_ms,',
      '  max_starts_per_minute = excluded.max_starts_per_minute, monsters_min = excluded.monsters_min, monsters_max = excluded.monsters_max,',
      '  daily = excluded.daily, min_level = excluded.min_level;',
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
  const { shops } = content;
  const sells = shops.shops.flatMap((sh) => sh.sells.map((x) => `  (${q(sh.id)}, ${q(x.item)}, ${x.price}, ${q(x.currency)})`));
  const buys = shops.shops.flatMap((sh) => content.items.items.filter((i) => shopBuys(sh, i)).map((i) => `  (${q(sh.id)}, ${q(i.id)})`));
  lines.push(
    '',
    'insert into public.shops (id, name, rest_price, exchange, upgrades) values',
    shops.shops.map((sh) => `  (${q(sh.id)}, ${q(sh.name)}, ${sh.rest ? sh.rest.price : 'null'}, ${sh.exchange}, ${sh.upgrades})`).join(',\n'),
    'on conflict (id) do update set name = excluded.name, rest_price = excluded.rest_price, exchange = excluded.exchange, upgrades = excluded.upgrades;',
    '',
    'insert into public.economy_rules (id, sell_rate, copper_per_gold) values',
    `  (1, ${shops.sellRate}, ${shops.copperPerGold})`,
    'on conflict (id) do update set sell_rate = excluded.sell_rate, copper_per_gold = excluded.copper_per_gold;',
  );
  if (sells.length > 0) {
    lines.push(
      '',
      'insert into public.shop_sells (shop_id, item_id, price, currency) values',
      sells.join(',\n'),
      'on conflict (shop_id, item_id) do update set price = excluded.price, currency = excluded.currency;',
    );
  }
  if (buys.length > 0) {
    lines.push('', 'insert into public.shop_buys (shop_id, item_id) values', buys.join(',\n'), 'on conflict (shop_id, item_id) do nothing;');
  }
  const recipes = content.recipes.recipes;
  if (recipes.length > 0) {
    lines.push(
      '',
      'insert into public.recipes (id, shop_id, item_id, copper, gold) values',
      recipes.map((r) => `  (${q(r.id)}, ${q(r.shop)}, ${q(r.item)}, ${r.copper}, ${r.gold})`).join(',\n'),
      'on conflict (id) do update set shop_id = excluded.shop_id, item_id = excluded.item_id, copper = excluded.copper, gold = excluded.gold;',
      '',
      'insert into public.recipe_materials (recipe_id, item_id, quantity) values',
      recipes.flatMap((r) => r.materials.map((m) => `  (${q(r.id)}, ${q(m.item)}, ${m.quantity})`)).join(',\n'),
      'on conflict (recipe_id, item_id) do update set quantity = excluded.quantity;',
    );
  }
  const sk = content.skills;
  const skillRows: { def: SkillDef; classId: string }[] = Object.entries(sk.classes).flatMap(([classId, c]) => [
    { classId, def: { type: 'active' as const, ...c.active } },
    ...c.passives.map((p) => ({ classId, def: { type: 'passive' as const, ...p } })),
  ]);
  lines.push(
    '',
    'insert into public.skill_rules (id, points_per_level) values',
    `  (1, ${sk.pointsPerLevel})`,
    'on conflict (id) do update set points_per_level = excluded.points_per_level;',
    '',
    'insert into public.skills (id, class_id, kind, effect) values',
    skillRows.map(({ def, classId }) => `  (${q(def.id)}, ${q(classId)}, ${q(def.type)}, ${def.type === 'passive' ? q(def.effect.kind) : 'null'})`).join(',\n'),
    'on conflict (id) do update set class_id = excluded.class_id, kind = excluded.kind, effect = excluded.effect;',
    '',
    'insert into public.skill_grades (skill_id, grade, points, scroll_item_id, effect_value) values',
    skillRows
      .flatMap(({ def }) =>
        Array.from({ length: maxGrade(sk, def) }, (_, i) => {
          const c = gradeCost(sk, def, i + 1);
          const value = def.type === 'passive' ? String(def.effect.values[i]) : 'null';
          return `  (${q(def.id)}, ${i + 1}, ${c.points}, ${c.scroll ? q(c.scroll) : 'null'}, ${value})`;
        }),
      )
      .join(',\n'),
    'on conflict (skill_id, grade) do update set points = excluded.points, scroll_item_id = excluded.scroll_item_id, effect_value = excluded.effect_value;',
    '',
    'insert into public.class_evolution (level, copper, gold) values',
    sk.evolution.map((e) => `  (${e.level}, ${e.copper}, ${e.gold})`).join(',\n'),
    'on conflict (level) do update set copper = excluded.copper, gold = excluded.gold;',
  );
  const qs = content.quests;
  const rewardItems = qs.templates.flatMap((t) => t.reward.items.map((r) => `  (${q(t.id)}, ${q(r.item)}, ${r.quantity})`));
  lines.push(
    '',
    'insert into public.quest_rules (id, per_day) values',
    `  (1, ${qs.perDay})`,
    'on conflict (id) do update set per_day = excluded.per_day;',
    '',
    'insert into public.quest_templates (id, name, kind, target, count, min_level, max_level, reward_xp, reward_copper) values',
    qs.templates
      .map((t) => `  (${q(t.id)}, ${q(t.name)}, ${q(t.kind)}, ${q(t.target)}, ${t.count}, ${t.minLevel}, ${t.maxLevel ?? 'null'}, ${t.reward.xp}, ${t.reward.copper})`)
      .join(',\n'),
    'on conflict (id) do update set name = excluded.name, kind = excluded.kind, target = excluded.target, count = excluded.count,',
    '  min_level = excluded.min_level, max_level = excluded.max_level, reward_xp = excluded.reward_xp, reward_copper = excluded.reward_copper;',
  );
  if (rewardItems.length > 0) {
    lines.push(
      '',
      'insert into public.quest_reward_items (quest_id, item_id, quantity) values',
      rewardItems.join(',\n'),
      'on conflict (quest_id, item_id) do update set quantity = excluded.quantity;',
    );
  }
  lines.push(
    '',
    'insert into public.level_thresholds (level, total_xp) values',
    thresholds.map((xp, level) => `  (${level}, ${xp})`).join(',\n'),
    'on conflict (level) do update set total_xp = excluded.total_xp;',
    '',
    'insert into public.combat_rules (id, max_dps_base, max_dps_per_level, max_dps_per_attack, max_dps_per_skill_point_percent) values',
    `  (1, ${dps.base}, ${dps.perLevel}, ${dps.perAttackBonus}, ${dps.perSkillPointPercent})`,
    'on conflict (id) do update set max_dps_base = excluded.max_dps_base, max_dps_per_level = excluded.max_dps_per_level,',
    '  max_dps_per_attack = excluded.max_dps_per_attack, max_dps_per_skill_point_percent = excluded.max_dps_per_skill_point_percent;',
  );
  return `${lines.join('\n')}\n`;
}
