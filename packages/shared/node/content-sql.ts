import type { Content } from '../src/index.ts';

/** Marca as migrations geradas por `npm run db:content`. */
export const CONTENT_SYNC_SUFFIX = '_content_sync.sql';

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * SQL que copia para o banco os dados de content/ que o servidor usa para validar a coleta:
 * itens, regras das áreas, pesos das raridades e itens de cada área. Pode rodar várias vezes.
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
        return `  (${q(a.id)}, ${r.nodes.min}, ${r.nodes.max}, ${r.expiresMinutes}, ${r.collectCooldownMs}, ${r.maxStartsPerMinute})`;
      })
      .join(',\n');
    const ruleRows = areas
      .flatMap((a) => a.resources!.rarities.map((r) => `  (${q(a.id)}, ${q(r.rarity)}, ${r.weight}, ${r.quantity.min}, ${r.quantity.max})`))
      .join(',\n');
    const itemRows = areas.flatMap((a) => a.resources!.items.map((id) => `  (${q(a.id)}, ${q(id)})`)).join(',\n');
    lines.push(
      '',
      'insert into public.exploration_areas (id, nodes_min, nodes_max, expires_minutes, collect_cooldown_ms, max_starts_per_minute) values',
      areaRows,
      'on conflict (id) do update set nodes_min = excluded.nodes_min, nodes_max = excluded.nodes_max,',
      '  expires_minutes = excluded.expires_minutes, collect_cooldown_ms = excluded.collect_cooldown_ms,',
      '  max_starts_per_minute = excluded.max_starts_per_minute;',
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
  return `${lines.join('\n')}\n`;
}
