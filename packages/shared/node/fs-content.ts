import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RawContent } from '../src/index.ts';

export const CONTENT_DIR = join(import.meta.dirname, '..', '..', '..', 'content');

const readJson = (file: string): unknown => JSON.parse(readFileSync(join(CONTENT_DIR, file), 'utf8'));

export function readRawContent(): RawContent {
  const maps: Record<string, unknown> = {};
  for (const f of readdirSync(join(CONTENT_DIR, 'maps')).filter((f) => f.endsWith('.json'))) {
    maps[f] = readJson(join('maps', f));
  }
  return {
    rarities: readJson('rarities.json'),
    classes: readJson('classes.json'),
    tiles: readJson('tiles.json'),
    balance: readJson('balance.prototype.json'),
    objects: readJson('objects.json'),
    items: readJson('items.json'),
    creatures: readJson('creatures.json'),
    progression: readJson('progression.json'),
    combat: readJson('combat.json'),
    world: readJson('world.json'),
    procedural: readJson('procedural.json'),
    shops: readJson('shops.json'),
    equipment: readJson('equipment.json'),
    recipes: readJson('recipes.json'),
    maps,
  };
}
