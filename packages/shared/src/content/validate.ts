import type { z } from 'zod';
import {
  asciiMapSchema,
  balanceSchema,
  classesSchema,
  combatSchema,
  creaturesSchema,
  itemsSchema,
  objectsSchema,
  proceduralSchema,
  progressionSchema,
  raritiesSchema,
  tilesSchema,
  worldSchema,
  type AsciiMap,
  type Balance,
  type Classes,
  type Combat,
  type Creatures,
  type Items,
  type ObjectDefs,
  type Procedural,
  type Progression,
  type Rarities,
  type TileDefs,
  type World,
} from './schemas.ts';
import { exitAt, isWalkable, parseAsciiMap, reachableFrom, type GridPoint, type ParsedMap } from '../map/tilemap.ts';
import { generateCave } from '../procgen/cave.ts';
import { placeChests } from '../procgen/chests.ts';
import { placeResourceNodes } from '../procgen/resources.ts';
import { placeMonsters } from '../procgen/creatures.ts';

export interface RawContent {
  rarities: unknown;
  classes: unknown;
  tiles: unknown;
  balance: unknown;
  objects: unknown;
  items: unknown;
  creatures: unknown;
  progression: unknown;
  combat: unknown;
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
  items: Items;
  creatures: Creatures;
  progression: Progression;
  combat: Combat;
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

  const items = parseWith(itemsSchema, raw.items, 'items.json');
  assertUnique(items.items.map((i) => i.id), 'items.json (id)');
  const rarityIds = new Set(rarities.rarities.map((r) => r.id));
  for (const item of items.items) {
    if (!rarityIds.has(item.rarity)) throw new Error(`items.json: raridade "${item.rarity}" de "${item.id}" não existe em rarities.json`);
  }
  const itemById = new Map(items.items.map((i) => [i.id, i]));

  const creatures = parseWith(creaturesSchema, raw.creatures, 'creatures.json');
  assertUnique(creatures.creatures.map((c) => c.id), 'creatures.json (id)');
  for (const c of creatures.creatures) {
    for (const d of c.drops) {
      if (!itemById.has(d.item)) throw new Error(`creatures.json: "${c.id}" solta "${d.item}", que não existe em items.json`);
    }
  }
  const creatureIds = new Set(creatures.creatures.map((c) => c.id));

  const progression = parseWith(progressionSchema, raw.progression, 'progression.json');
  assertUnique(progression.pathStats.map((c) => c.pathId), 'progression.json (pathId)');
  const combat = parseWith(combatSchema, raw.combat, 'combat.json');
  // todo caminho de classe precisa de atributos e de um ataque básico
  for (const path of classes.paths) {
    if (!progression.pathStats.some((ps) => ps.pathId === path.id)) throw new Error(`progression.json: faltam os atributos do caminho "${path.id}"`);
    if (!combat.basicAttacks[path.id]) throw new Error(`combat.json: falta o ataque básico do caminho "${path.id}"`);
  }
  for (const id of [...progression.pathStats.map((p) => p.pathId), ...Object.keys(combat.basicAttacks)]) {
    if (!classes.paths.some((p) => p.id === id)) throw new Error(`progression.json/combat.json: caminho "${id}" não existe em classes.json`);
  }

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
    const sample = generateCave(area, tiles, 1);
    const res = area.resources;
    if (res) {
      const where = `procedural.json: ${area.id}.resources`;
      assertUnique(res.items, `${where}.items`);
      assertUnique(res.rarities.map((r) => r.rarity), `${where}.rarities`);
      const ruled = new Set(res.rarities.map((r) => r.rarity));
      for (const id of res.items) {
        const item = itemById.get(id);
        if (!item) throw new Error(`${where}: item "${id}" não existe em items.json`);
        if (!ruled.has(item.rarity)) throw new Error(`${where}: item "${id}" é ${item.rarity}, mas essa raridade não tem regra em 'rarities'`);
      }
      for (const r of res.rarities) {
        if (!rarityIds.has(r.rarity)) throw new Error(`${where}: raridade "${r.rarity}" não existe em rarities.json`);
        if (!res.items.some((id) => itemById.get(id)?.rarity === r.rarity)) throw new Error(`${where}: nenhum item da raridade "${r.rarity}"`);
      }
      // o maior número de pontos precisa caber no mapa de amostra
      placeResourceNodes(parseAsciiMap(sample.map, tiles), sample.seed, res.nodes.max, res);
    }
    const cr = area.creatures;
    if (cr) {
      const where = `procedural.json: ${area.id}.creatures`;
      assertUnique(cr.spawn.map((x) => x.creature), `${where}.spawn`);
      for (const x of cr.spawn) {
        if (!creatureIds.has(x.creature)) throw new Error(`${where}: monstro "${x.creature}" não existe em creatures.json`);
      }
      const isDecor = new Map(creatures.creatures.map((c) => [c.id, c.decorative]));
      for (const x of cr.spawn) {
        if (isDecor.get(x.creature)) throw new Error(`${where}: "${x.creature}" é decorativo; ponha-o em 'decor', não em 'spawn'`);
      }
      for (const x of cr.decor) {
        if (!creatureIds.has(x.creature)) throw new Error(`${where}.decor: "${x.creature}" não existe em creatures.json`);
        if (!isDecor.get(x.creature)) throw new Error(`${where}.decor: "${x.creature}" precisa de "decorative": true`);
      }
    }
    // O pior caso (máximo de pontos, de monstros, todos no fundo, e de baús) precisa caber no mapa de amostra.
    const map = parseAsciiMap(sample.map, tiles);
    const nodes = res ? placeResourceNodes(map, sample.seed, res.nodes.max, res) : [];
    const monsters = cr ? placeMonsters(map, sample.seed, cr.count.max, cr, nodes, () => true) : [];
    const ch = area.chests;
    if (ch) {
      const where = `procedural.json: ${area.id}.chests`;
      assertUnique(ch.items.map((x) => x.item), `${where}.items`);
      for (const x of ch.items) {
        if (!itemById.has(x.item)) throw new Error(`${where}: item "${x.item}" não existe em items.json`);
      }
      placeChests(map, sample.seed, ch.count.max, ch, [...nodes, ...monsters]);
    }
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

  return { rarities, classes, tiles, balance, objects, items, creatures, progression, combat, world, procedural, maps };
}
