import type { z } from 'zod';
import {
  asciiMapSchema,
  balanceSchema,
  classesSchema,
  objectsSchema,
  proceduralSchema,
  raritiesSchema,
  tilesSchema,
  worldSchema,
  type AsciiMap,
  type Balance,
  type Classes,
  type ObjectDefs,
  type Procedural,
  type Rarities,
  type TileDefs,
  type World,
} from './schemas.ts';
import { exitAt, isWalkable, parseAsciiMap, reachableFrom, type GridPoint, type ParsedMap } from '../map/tilemap.ts';
import { generateCave } from '../procgen/cave.ts';

export interface RawContent {
  rarities: unknown;
  classes: unknown;
  tiles: unknown;
  balance: unknown;
  objects: unknown;
  world: unknown;
  procedural: unknown;
  maps: Record<string, unknown>;
}

export interface Content {
  rarities: Rarities;
  classes: Classes;
  tiles: TileDefs;
  balance: Balance;
  objects: ObjectDefs;
  world: World;
  procedural: Procedural;
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
  assertUnique(tiles.tiles.flatMap((t) => (t.char ? [t.char] : [])), 'tiles.json (char)');
  assertUnique(tiles.tiles.map((t) => String(t.index)), 'tiles.json (index)');
  const tileById = new Map(tiles.tiles.map((t) => [t.id, t]));
  for (const t of tiles.tiles) {
    for (const v of t.variants ?? []) {
      const variant = tileById.get(v);
      if (!variant) throw new Error(`tiles.json: variação "${v}" de "${t.id}" não existe`);
      if (variant.solid !== t.solid) throw new Error(`tiles.json: variação "${v}" precisa ter o mesmo 'solid' de "${t.id}"`);
    }
  }

  const objects = parseWith(objectsSchema, raw.objects, 'objects.json');
  assertUnique(objects.objects.map((o) => o.id), 'objects.json (id)');
  const world = parseWith(worldSchema, raw.world, 'world.json');

  const maps: Record<string, AsciiMap> = {};
  const parsed: Record<string, ParsedMap> = {};
  for (const [file, value] of Object.entries(raw.maps)) {
    const map = parseWith(asciiMapSchema, value, `maps/${file}`);
    if (maps[map.id]) throw new Error(`Dois mapas com o id "${map.id}"`);
    // valida legenda, formato, bordas, objetos e alcance
    parsed[map.id] = parseAsciiMap(map, tiles, objects, balance.tileSize);
    maps[map.id] = map;
  }

  const procedural = parseWith(proceduralSchema, raw.procedural, 'procedural.json');
  const areas = new Map(procedural.areas.map((a) => [a.id, a]));
  for (const area of procedural.areas) {
    if (maps[area.id]) throw new Error(`procedural.json: "${area.id}" tem o mesmo id de um mapa fixo`);
    const known = new Set(tiles.tiles.flatMap((t) => (t.char ? [t.char] : [])));
    for (const [role, ch] of Object.entries(area.chars)) {
      if (!known.has(ch)) throw new Error(`procedural.json: ${area.id}.chars.${role} "${ch}" não existe em tiles.json`);
    }
    // uma geração de amostra garante que a configuração consegue produzir um mapa válido
    generateCave(area, tiles, 1);
  }

  if (!maps[world.startMap]) throw new Error(`world.json: startMap "${world.startMap}" não existe em maps/`);

  // Ponto de chegada num mapa fixo: livre, alcançável e fora de outra saída (senão o jogador ficaria indo e voltando).
  const checkArrival = (where: string, to: string, arriveAt: GridPoint | undefined) => {
    if (areas.has(to)) return; // mapa gerado: o jogador chega pelo ponto de entrada dele
    const target = parsed[to];
    if (!target) throw new Error(`${where}: mapa de destino "${to}" não existe`);
    if (!arriveAt) throw new Error(`${where}: falta arriveAt (obrigatório para mapa fixo)`);
    if (!isWalkable(target, arriveAt)) throw new Error(`${where}: arriveAt está bloqueado no destino`);
    if (!reachableFrom(target, target.spawn).has(`${arriveAt.x},${arriveAt.y}`)) {
      throw new Error(`${where}: arriveAt não é alcançável no destino`);
    }
    if (exitAt(target, arriveAt)) throw new Error(`${where}: arriveAt fica dentro de uma saída do destino`);
  };
  for (const map of Object.values(parsed)) {
    for (const exit of map.exits) checkArrival(`Mapa ${map.id}: saída para "${exit.to}"`, exit.to, exit.arriveAt);
  }
  for (const area of procedural.areas) checkArrival(`procedural.json: ${area.id}.returnTo`, area.returnTo.map, area.returnTo.arriveAt);

  return { rarities, classes, tiles, balance, objects, world, procedural, maps };
}
