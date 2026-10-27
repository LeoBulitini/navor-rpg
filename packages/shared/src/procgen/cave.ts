import type { AsciiMap, CaveConfig, TileDefs } from '../content/schemas.ts';
import { parseAsciiMap, reachableFrom, type GridPoint } from '../map/tilemap.ts';
import { createRng, type Rng } from './rng.ts';

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GeneratedCave {
  /** Seed que gerou este mapa (pode ser diferente da pedida, se precisou tentar de novo). */
  seed: number;
  map: AsciiMap;
  rooms: Room[];
}

const center = (r: Room): GridPoint => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

/**
 * Gera uma Gruta a partir de uma seed: salas retangulares ligadas por corredores
 * (árvore geradora mínima + alguns atalhos), entrada no topo e saída embaixo.
 * A mesma seed e a mesma configuração sempre produzem o mesmo mapa.
 * O resultado passa pelo validador comum de mapas e por checagens próprias; se uma
 * tentativa falhar, tenta a seed seguinte (até `maxAttempts`).
 */
export function generateCave(config: CaveConfig, tiles: TileDefs, seed: number, maxAttempts = 20): GeneratedCave {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const s = (seed + attempt) >>> 0;
    try {
      const cave = buildCave(config, s);
      validateCave(cave, config, tiles);
      return cave;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Gruta: nenhuma geração válida a partir da seed ${seed}: ${(lastError as Error)?.message}`);
}

function buildCave(config: CaveConfig, seed: number): GeneratedCave {
  const rng = createRng(seed);
  const { width: W, height: H, chars } = config;
  const grid: string[][] = Array.from({ length: H }, () => Array<string>(W).fill(chars.wall));
  const carve = (x: number, y: number) => {
    if (x > 0 && y > 0 && x < W - 1 && y < H - 1) grid[y]![x] = chars.floor;
  };

  const rooms = placeRooms(config, rng);
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) carve(x, y);

  // Corredores: árvore geradora mínima (todas as salas ligadas) + atalhos que criam desvios e voltas.
  const edges = minimumSpanningTree(rooms);
  const extra = rng.int(config.extraCorridors.min, config.extraCorridors.max);
  for (let i = 0; i < extra && rooms.length > 2; i++) {
    const a = rng.int(0, rooms.length - 1);
    const b = rng.int(0, rooms.length - 1);
    if (a !== b) edges.push([a, b]);
  }
  for (const [a, b] of edges) carveCorridor(center(rooms[a]!), center(rooms[b]!), config.corridorWidth, rng, carve);

  // Entrada: abertura no topo acima da primeira sala (a mais alta). Saída: embaixo da última (a mais baixa).
  const top = rooms[0]!;
  const bottom = rooms[rooms.length - 1]!;
  const ex = clamp(center(top).x, 1, W - 3);
  const sx = clamp(center(bottom).x, 1, W - 3);
  for (let y = 0; y <= top.y; y++) for (const x of [ex, ex + 1]) grid[y]![x] = y === 0 ? chars.entrance : chars.floor;
  for (let y = bottom.y + bottom.h - 1; y < H; y++) for (const x of [sx, sx + 1]) grid[y]![x] = y === H - 1 ? chars.exit : chars.floor;
  const spawn = { x: ex, y: 2 };

  // Rochas soltas dentro das salas (só enfeite e obstáculo; não podem fechar caminho).
  const rocks = rng.int(config.rocks.min, config.rocks.max);
  for (let i = 0; i < rocks; i++) {
    const r = rooms[rng.int(0, rooms.length - 1)]!;
    const p = { x: rng.int(r.x, r.x + r.w - 1), y: rng.int(r.y, r.y + r.h - 1) };
    if (Math.abs(p.x - spawn.x) + Math.abs(p.y - spawn.y) < 3) continue;
    if (grid[p.y]![p.x] !== chars.floor) continue;
    grid[p.y]![p.x] = chars.rock;
    if (!allFloorConnected(grid, chars, spawn)) grid[p.y]![p.x] = chars.floor;
  }

  grid[spawn.y]![spawn.x] = config.spawnChar;
  const { returnTo } = config;
  const map: AsciiMap = {
    id: config.id,
    name: config.name,
    spawnChar: config.spawnChar,
    spawnTile: config.spawnTile,
    rows: grid.map((r) => r.join('')),
    objects: [],
    exits: [
      { x: ex, y: 0, w: 2, h: 1, to: returnTo.map, arriveAt: returnTo.arriveAt, label: 'Voltar para a cidade' },
      { x: sx, y: H - 1, w: 2, h: 1, to: returnTo.map, arriveAt: returnTo.arriveAt, label: 'Saída da Gruta' },
    ],
  };
  return { seed, map, rooms };
}

function placeRooms(config: CaveConfig, rng: Rng): Room[] {
  const { width: W, height: H } = config;
  const target = rng.int(config.rooms.min, config.rooms.max);
  const rooms: Room[] = [];
  for (let tries = 0; tries < 400 && rooms.length < target; tries++) {
    const w = rng.int(config.roomSize.min, config.roomSize.max);
    const h = rng.int(config.roomSize.min, config.roomSize.max);
    // margem de 2 tiles: borda sólida + espaço para a abertura da entrada/saída
    const r = { x: rng.int(2, W - w - 2), y: rng.int(3, H - h - 3), w, h };
    const overlaps = rooms.some((o) => r.x - 2 < o.x + o.w && o.x - 2 < r.x + r.w && r.y - 2 < o.y + o.h && o.y - 2 < r.y + r.h);
    if (!overlaps) rooms.push(r);
  }
  if (rooms.length < config.rooms.min) throw new Error(`só coube(ram) ${rooms.length} sala(s)`);
  // ordena de cima para baixo: a primeira recebe a entrada e a última a saída
  return rooms.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Prim simples pela distância entre centros. Devolve pares de índices de salas. */
function minimumSpanningTree(rooms: Room[]): [number, number][] {
  const inTree = new Set([0]);
  const edges: [number, number][] = [];
  const dist = (a: number, b: number) => {
    const ca = center(rooms[a]!);
    const cb = center(rooms[b]!);
    return Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y);
  };
  while (inTree.size < rooms.length) {
    let best: [number, number] | null = null;
    for (const a of inTree) {
      for (let b = 0; b < rooms.length; b++) {
        if (inTree.has(b)) continue;
        if (!best || dist(a, b) < dist(best[0], best[1])) best = [a, b];
      }
    }
    edges.push(best!);
    inTree.add(best![1]);
  }
  return edges;
}

/** Corredor em "L" com a largura pedida; a ordem (horizontal ou vertical primeiro) vem da seed. */
function carveCorridor(a: GridPoint, b: GridPoint, width: number, rng: Rng, carve: (x: number, y: number) => void): void {
  const horizontalFirst = rng.next() < 0.5;
  const corner = horizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  for (const [from, to] of [[a, corner], [corner, b]] as const) {
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    let p = { ...from };
    for (;;) {
      // pincel quadrado: mantém a largura também nas curvas
      for (let i = 0; i < width; i++) for (let j = 0; j < width; j++) carve(p.x + i, p.y + j);
      if (p.x === to.x && p.y === to.y) break;
      p = { x: p.x + dx, y: p.y + dy };
    }
  }
}

function allFloorConnected(grid: string[][], chars: CaveConfig['chars'], start: GridPoint): boolean {
  const walkable = (x: number, y: number) => {
    const c = grid[y]?.[x];
    return c === chars.floor || c === chars.entrance || c === chars.exit;
  };
  let total = 0;
  grid.forEach((row, y) => row.forEach((_, x) => walkable(x, y) && total++));
  const seen = new Set<string>([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length) {
    const p = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: p.x + dx, y: p.y + dy };
      const k = `${n.x},${n.y}`;
      if (!seen.has(k) && walkable(n.x, n.y)) {
        seen.add(k);
        queue.push(n);
      }
    }
  }
  return seen.size === total;
}

/**
 * Checagens antes de mostrar a Gruta: o validador comum (bordas, nascimento e saídas
 * alcançáveis) mais as regras da Gruta: tamanho, quantidade de salas, todas as salas
 * alcançáveis e um caminho da entrada até a saída.
 */
export function validateCave(cave: GeneratedCave, config: CaveConfig, tiles: TileDefs): void {
  const parsed = parseAsciiMap(cave.map, tiles);
  if (parsed.width !== config.width || parsed.height !== config.height) throw new Error('tamanho diferente do configurado');
  if (cave.rooms.length < config.rooms.min || cave.rooms.length > config.rooms.max) throw new Error('quantidade de salas fora do intervalo');
  const reach = reachableFrom(parsed, parsed.spawn);
  for (const r of cave.rooms) {
    const c = center(r);
    const anyCell = Array.from({ length: r.w * r.h }, (_, i) => ({ x: r.x + (i % r.w), y: r.y + Math.floor(i / r.w) }));
    if (!anyCell.some((p) => reach.has(`${p.x},${p.y}`))) throw new Error(`sala em (${c.x}, ${c.y}) inalcançável`);
  }
  const [entrance, exit] = cave.map.exits;
  if (!reach.has(`${entrance!.x},${entrance!.y}`) || !reach.has(`${exit!.x},${exit!.y}`)) {
    throw new Error('sem caminho da entrada até a saída');
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
