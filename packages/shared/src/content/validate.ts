import type { z } from 'zod';
import {
  asciiMapSchema,
  balanceSchema,
  classesSchema,
  raritiesSchema,
  tilesSchema,
  type AsciiMap,
  type Balance,
  type Classes,
  type Rarities,
  type TileDefs,
} from './schemas.ts';
import { parseAsciiMap } from '../map/tilemap.ts';

export interface RawContent {
  rarities: unknown;
  classes: unknown;
  tiles: unknown;
  balance: unknown;
  maps: Record<string, unknown>;
}

export interface Content {
  rarities: Rarities;
  classes: Classes;
  tiles: TileDefs;
  balance: Balance;
  maps: Record<string, AsciiMap>;
}

function parseWith<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`);
    throw new Error(`Conteúdo inválido em ${label}:\n${issues.join('\n')}`);
  }
  return result.data;
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) throw new Error(`Valor duplicado em ${label}: "${v}"`);
    seen.add(v);
  }
}

/** Valida todo o conteúdo e as referências cruzadas. Lança erro legível se algo estiver errado. */
export function loadContent(raw: RawContent): Content {
  const rarities = parseWith(raritiesSchema, raw.rarities, 'rarities.json');
  const classes = parseWith(classesSchema, raw.classes, 'classes.json');
  const tiles = parseWith(tilesSchema, raw.tiles, 'tiles.json');
  const balance = parseWith(balanceSchema, raw.balance, 'balance.prototype.json');

  assertUnique(rarities.rarities.map((r) => r.id), 'rarities.json (id)');
  assertUnique(classes.paths.flatMap((p) => p.stages.map((s) => s.classId)), 'classes.json (classId)');
  assertUnique(tiles.tiles.map((t) => t.id), 'tiles.json (id)');
  assertUnique(tiles.tiles.map((t) => t.char), 'tiles.json (char)');
  assertUnique(tiles.tiles.map((t) => String(t.index)), 'tiles.json (index)');

  const maps: Record<string, AsciiMap> = {};
  for (const [file, value] of Object.entries(raw.maps)) {
    const map = parseWith(asciiMapSchema, value, `maps/${file}`);
    parseAsciiMap(map, tiles); // valida legenda, formato, bordas e alcance
    maps[map.id] = map;
  }

  return { rarities, classes, tiles, balance, maps };
}
