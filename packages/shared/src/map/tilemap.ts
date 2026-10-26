import type { AsciiMap, TileDef, TileDefs } from '../content/schemas.ts';

export interface GridPoint {
  x: number;
  y: number;
}

export interface ParsedMap {
  id: string;
  width: number;
  height: number;
  /** tiles[y][x] = definição do tile naquela célula */
  tiles: TileDef[][];
  spawn: GridPoint;
}

/**
 * Converte um mapa ASCII em grade de tiles e valida:
 * - todas as linhas com a mesma largura;
 * - todo caractere existe em tiles.json (ou é o marcador de nascimento);
 * - exatamente um ponto de nascimento, sobre tile não sólido;
 * - borda externa toda sólida (o jogador não sai do mapa).
 */
export function parseAsciiMap(map: AsciiMap, defs: TileDefs): ParsedMap {
  const byChar = new Map(defs.tiles.map((t) => [t.char, t]));
  const spawnTile = defs.tiles.find((t) => t.id === map.spawnTile);
  if (!spawnTile) throw new Error(`Mapa ${map.id}: spawnTile "${map.spawnTile}" não existe em tiles.json`);
  if (spawnTile.solid) throw new Error(`Mapa ${map.id}: spawnTile "${map.spawnTile}" é sólido`);
  if (byChar.has(map.spawnChar)) {
    throw new Error(`Mapa ${map.id}: spawnChar "${map.spawnChar}" conflita com um tile de tiles.json`);
  }

  const height = map.rows.length;
  const width = map.rows[0]!.length;
  const tiles: TileDef[][] = [];
  const spawns: GridPoint[] = [];

  map.rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Mapa ${map.id}: linha ${y} tem ${row.length} colunas, esperado ${width}`);
    }
    const line: TileDef[] = [];
    [...row].forEach((ch, x) => {
      if (ch === map.spawnChar) {
        spawns.push({ x, y });
        line.push(spawnTile);
        return;
      }
      const def = byChar.get(ch);
      if (!def) throw new Error(`Mapa ${map.id}: caractere desconhecido "${ch}" em (${x}, ${y})`);
      line.push(def);
    });
    tiles.push(line);
  });

  if (spawns.length !== 1) {
    throw new Error(`Mapa ${map.id}: esperado 1 ponto de nascimento "${map.spawnChar}", encontrado ${spawns.length}`);
  }

  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      if (!tiles[y]![x]!.solid) throw new Error(`Mapa ${map.id}: borda aberta em (${x}, ${y})`);
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) {
      if (!tiles[y]![x]!.solid) throw new Error(`Mapa ${map.id}: borda aberta em (${x}, ${y})`);
    }
  }

  return { id: map.id, width, height, tiles, spawn: spawns[0]! };
}

export function isWalkable(map: ParsedMap, p: GridPoint): boolean {
  if (p.x < 0 || p.y < 0 || p.x >= map.width || p.y >= map.height) return false;
  return !map.tiles[p.y]![p.x]!.solid;
}

/** Busca em largura (4 vizinhos) a partir de `start`. Retorna as células alcançáveis como "x,y". */
export function reachableFrom(map: ParsedMap, start: GridPoint): Set<string> {
  const key = (p: GridPoint) => `${p.x},${p.y}`;
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

/** Matriz de índices do tileset, no formato que o Phaser aceita em make.tilemap({ data }). */
export function toTileIndexGrid(map: ParsedMap): number[][] {
  return map.tiles.map((row) => row.map((t) => t.index));
}
