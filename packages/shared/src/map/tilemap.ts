import type { AsciiMap, ObjectDef, ObjectDefs, TileDef, TileDefs } from '../content/schemas.ts';

export interface GridPoint {
  x: number;
  y: number;
}

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Objeto de objects.json já posicionado no mapa (coordenadas em pixels do mundo). */
export interface PlacedObject {
  def: ObjectDef;
  x: number;
  y: number;
  collider: PixelRect;
  door?: PixelRect & { message: string; approach: GridPoint };
}

export type MapExit = AsciiMap['exits'][number];

export interface ParsedMap {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  /** tiles[y][x] = definição do tile naquela célula */
  tiles: TileDef[][];
  /** blocked[y][x] = tile sólido ou coberto pela parte sólida de um objeto */
  blocked: boolean[][];
  spawn: GridPoint;
  objects: PlacedObject[];
  exits: MapExit[];
}

const EMPTY_OBJECTS: ObjectDefs = { objects: [] };

/**
 * Converte um mapa ASCII em grade de tiles e valida:
 * - todas as linhas com a mesma largura;
 * - todo caractere existe em tiles.json (ou é o marcador de nascimento);
 * - exatamente um ponto de nascimento, sobre tile livre;
 * - borda externa toda sólida, exceto onde há uma saída;
 * - objetos dentro do mapa e saídas, portas e nascimento alcançáveis entre si.
 */
export function parseAsciiMap(map: AsciiMap, defs: TileDefs, objectDefs: ObjectDefs = EMPTY_OBJECTS, tileSize = 32): ParsedMap {
  const fail = (msg: string): never => {
    throw new Error(`Mapa ${map.id}: ${msg}`);
  };
  const byChar = new Map(defs.tiles.filter((t) => t.char).map((t) => [t.char!, t]));
  const spawnTile = defs.tiles.find((t) => t.id === map.spawnTile);
  if (!spawnTile) fail(`spawnTile "${map.spawnTile}" não existe em tiles.json`);
  if (spawnTile!.solid) fail(`spawnTile "${map.spawnTile}" é sólido`);
  if (byChar.has(map.spawnChar)) fail(`spawnChar "${map.spawnChar}" conflita com um tile de tiles.json`);

  const height = map.rows.length;
  const width = map.rows[0]!.length;
  const tiles: TileDef[][] = [];
  const spawns: GridPoint[] = [];

  map.rows.forEach((row, y) => {
    if (row.length !== width) fail(`linha ${y} tem ${row.length} colunas, esperado ${width}`);
    const line: TileDef[] = [];
    [...row].forEach((ch, x) => {
      if (ch === map.spawnChar) {
        spawns.push({ x, y });
        line.push(spawnTile!);
        return;
      }
      const def = byChar.get(ch);
      if (!def) fail(`caractere desconhecido "${ch}" em (${x}, ${y})`);
      line.push(def!);
    });
    tiles.push(line);
  });

  if (spawns.length !== 1) fail(`esperado 1 ponto de nascimento "${map.spawnChar}", encontrado ${spawns.length}`);

  const inBounds = (p: GridPoint) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  for (const exit of map.exits) {
    if (!inBounds(exit) || !inBounds({ x: exit.x + exit.w - 1, y: exit.y + exit.h - 1 })) {
      fail(`saída para "${exit.to}" fora do mapa`);
    }
  }
  const inExit = (p: GridPoint) => exitAt({ exits: map.exits } as ParsedMap, p) !== undefined;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (border && !tiles[y]![x]!.solid && !inExit({ x, y })) fail(`borda aberta em (${x}, ${y})`);
    }
  }

  const blocked = tiles.map((row) => row.map((t) => t.solid));
  const byId = new Map(objectDefs.objects.map((o) => [o.id, o]));
  const objects: PlacedObject[] = map.objects.map((placed) => {
    const def = byId.get(placed.ref);
    if (!def) return fail(`objeto "${placed.ref}" não existe em objects.json`);
    const x = placed.x * tileSize;
    const y = placed.y * tileSize;
    if (x + def.width > width * tileSize || y + def.height > height * tileSize) {
      fail(`objeto "${placed.ref}" em (${placed.x}, ${placed.y}) sai do mapa`);
    }
    const collider = { x: x + def.collider.x, y: y + def.collider.y, w: def.collider.w, h: def.collider.h };
    for (let ty = Math.floor(collider.y / tileSize); ty <= Math.floor((collider.y + collider.h - 1) / tileSize); ty++) {
      for (let tx = Math.floor(collider.x / tileSize); tx <= Math.floor((collider.x + collider.w - 1) / tileSize); tx++) {
        blocked[ty]![tx] = true;
      }
    }
    const obj: PlacedObject = { def, x, y, collider };
    if (def.door) {
      const rect = { x: x + def.door.x, y: y + def.door.y, w: def.door.w, h: def.door.h };
      // célula em frente à porta, logo abaixo da base do prédio
      const approach = {
        x: Math.floor((rect.x + rect.w / 2) / tileSize),
        y: Math.floor((collider.y + collider.h - 1) / tileSize) + 1,
      };
      obj.door = { ...rect, message: def.door.message, approach };
    }
    return obj;
  });

  const parsed: ParsedMap = {
    id: map.id,
    name: map.name,
    width,
    height,
    tileSize,
    tiles,
    blocked,
    spawn: spawns[0]!,
    objects,
    exits: map.exits,
  };

  if (!isWalkable(parsed, parsed.spawn)) fail('o ponto de nascimento está bloqueado por um objeto');
  const reach = reachableFrom(parsed, parsed.spawn);
  for (const exit of map.exits) {
    const cells = Array.from({ length: exit.w * exit.h }, (_, i) => ({ x: exit.x + (i % exit.w), y: exit.y + Math.floor(i / exit.w) }));
    if (!cells.some((c) => reach.has(key(c)))) fail(`a saída para "${exit.to}" não é alcançável a partir do nascimento`);
  }
  for (const obj of objects) {
    if (obj.door && !reach.has(key(obj.door.approach))) {
      fail(`a porta de "${obj.def.id}" não é alcançável a partir do nascimento`);
    }
  }
  return parsed;
}

/** A célula está dentro de alguma saída do mapa? */
export function exitAt(map: ParsedMap, p: GridPoint): MapExit | undefined {
  return map.exits.find((e) => p.x >= e.x && p.x < e.x + e.w && p.y >= e.y && p.y < e.y + e.h);
}

const key = (p: GridPoint) => `${p.x},${p.y}`;

export function isWalkable(map: ParsedMap, p: GridPoint): boolean {
  if (p.x < 0 || p.y < 0 || p.x >= map.width || p.y >= map.height) return false;
  return !map.blocked[p.y]![p.x]!;
}

/** Busca em largura (4 vizinhos) a partir de `start`. Retorna as células alcançáveis como "x,y". */
export function reachableFrom(map: ParsedMap, start: GridPoint): Set<string> {
  const seen = new Set<string>();
  if (!isWalkable(map, start)) return seen;
  const queue: GridPoint[] = [start];
  seen.add(key(start));
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next = { x: cur.x + dx, y: cur.y + dy };
      if (isWalkable(map, next) && !seen.has(key(next))) {
        seen.add(key(next));
        queue.push(next);
      }
    }
  }
  return seen;
}

/**
 * Matriz de índices do tileset, no formato que o Phaser aceita em make.tilemap({ data }).
 * Tiles com 'variants' sorteiam uma variação pela posição: o mesmo mapa sempre fica igual.
 */
export function toTileIndexGrid(map: ParsedMap, defs?: TileDefs): number[][] {
  const byId = new Map(defs?.tiles.map((t) => [t.id, t]) ?? []);
  return map.tiles.map((row, y) =>
    row.map((t, x) => {
      if (!t.variants?.length || !defs) return t.index;
      const options = [t.index, ...t.variants.map((id) => byId.get(id)!.index)];
      return options[cellHash(x, y) % options.length]!;
    }),
  );
}

function cellHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
