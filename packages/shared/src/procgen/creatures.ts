import type { CreatureDef, Creatures, CreaturesConfig } from '../content/schemas.ts';
import { exitAt, isWalkable, type GridPoint, type ParsedMap } from '../map/tilemap.ts';
import { createRng, type Rng } from './rng.ts';

/** Um monstro de uma entrada. No jogo online, o tipo vem do servidor (start_exploration). */
export interface MonsterSpawn {
  index: number;
  creatureId: string;
}

export interface KillRewards {
  xp: number;
  copper: number;
  drops: { itemId: string; quantity: number }[];
}

const PLACEMENT_SALT = 0x27d4eb2f;
const DECOR_SALT = 0x165667b1;
/** "Fundo" da área: células a pelo menos esta fração da maior distância (andando) desde o nascimento. */
export const DEEP_FRACTION = 0.5;

/**
 * Posições dos monstros, a partir da seed: chão alcançável, longe (`clearance`) da entrada,
 * da saída e do nascimento, fora das células em `avoid` (pontos de coleta) e um por célula.
 * `deep(i)` pede que o monstro n.º i fique no fundo da área (GDD 8.2: Esqueleto Antigo).
 */
export function placeMonsters(
  map: ParsedMap,
  seed: number,
  count: number,
  config: Pick<CreaturesConfig, 'clearance'>,
  avoid: GridPoint[] = [],
  deep: (index: number) => boolean = () => false,
  salt = PLACEMENT_SALT,
): GridPoint[] {
  const rng = createRng((seed ^ salt) >>> 0);
  const dist = walkDistances(map, map.spawn);
  const maxDist = Math.max(...dist.values());
  const keepAway: GridPoint[] = [map.spawn];
  for (const e of map.exits) {
    for (let y = e.y; y < e.y + e.h; y++) for (let x = e.x; x < e.x + e.w; x++) keepAway.push({ x, y });
  }
  const taken = new Set(avoid.map((p) => `${p.x},${p.y}`));
  const far = (p: GridPoint) => keepAway.every((q) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) >= config.clearance);
  const candidates: GridPoint[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const p = { x, y };
      if (dist.has(`${x},${y}`) && !taken.has(`${x},${y}`) && !exitAt(map, p) && far(p)) candidates.push(p);
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }
  const chosen: GridPoint[] = [];
  for (let i = 0; i < count; i++) {
    const wantDeep = deep(i);
    const at = candidates.findIndex((p) => !wantDeep || dist.get(`${p.x},${p.y}`)! >= maxDist * DEEP_FRACTION);
    if (at < 0) throw new Error(`Área (seed ${seed}): só couberam ${chosen.length} de ${count} criaturas`);
    chosen.push(candidates.splice(at, 1)[0]!);
  }
  return chosen;
}

/** Bichos de enfeite da área (ex.: Esquilos): tipo, quantidade e posição saem só da seed. */
export function placeDecor(map: ParsedMap, seed: number, config: CreaturesConfig, avoid: GridPoint[]): { creatureId: string; cell: GridPoint }[] {
  const rng = createRng((seed ^ DECOR_SALT) >>> 0);
  const ids = config.decor.flatMap((d) => Array<string>(rng.int(d.count.min, d.count.max)).fill(d.creature));
  const cells = placeMonsters(map, seed, ids.length, { clearance: 2 }, avoid, () => false, DECOR_SALT);
  return ids.map((creatureId, i) => ({ creatureId, cell: cells[i]! }));
}

/** Distância andando (passos em 4 direções) do ponto a cada célula alcançável. */
export function walkDistances(map: ParsedMap, from: GridPoint): Map<string, number> {
  const dist = new Map<string, number>([[`${from.x},${from.y}`, 0]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head]!;
    const d = dist.get(`${p.x},${p.y}`)!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: p.x + dx, y: p.y + dy };
      const k = `${n.x},${n.y}`;
      if (dist.has(k) || !isWalkable(map, n)) continue;
      dist.set(k, d + 1);
      queue.push(n);
    }
  }
  return dist;
}

/** Tipos dos monstros pelo peso. É a mesma regra de start_exploration; aqui serve ao modo offline. */
export function rollMonsters(config: CreaturesConfig, rng: Rng): MonsterSpawn[] {
  const total = config.spawn.reduce((s, c) => s + c.weight, 0);
  const count = rng.int(config.count.min, config.count.max);
  return Array.from({ length: count }, (_, index) => {
    let pick = rng.next() * total;
    const entry = config.spawn.find((c) => (pick -= c.weight) < 0) ?? config.spawn[config.spawn.length - 1]!;
    return { index, creatureId: entry.creature };
  });
}

/** Recompensa de um abate. É a mesma regra de kill_monster; aqui serve ao modo offline. */
export function rollKillRewards(creature: CreatureDef, rng: Rng): KillRewards {
  const drops = creature.drops
    .filter((d) => rng.next() < d.chance)
    .map((d) => ({ itemId: d.item, quantity: rng.int(d.quantity.min, d.quantity.max) }));
  return { xp: creature.xp, copper: rng.int(creature.copper.min, creature.copper.max), drops };
}

export function creatureById(creatures: Creatures, id: string): CreatureDef {
  const c = creatures.creatures.find((x) => x.id === id);
  if (!c) throw new Error(`Monstro desconhecido: ${id}`);
  return c;
}
