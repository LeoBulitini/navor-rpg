import type { CreatureDef, Creatures, CreaturesConfig } from '../content/schemas.ts';
import { exitAt, reachableFrom, type GridPoint, type ParsedMap } from '../map/tilemap.ts';
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

/**
 * Posições dos monstros, a partir da seed: chão alcançável, longe (`clearance`) da entrada,
 * da saída e do nascimento, fora das células em `avoid` (pontos de coleta) e um por célula.
 */
export function placeMonsters(map: ParsedMap, seed: number, count: number, config: CreaturesConfig, avoid: GridPoint[] = []): GridPoint[] {
  const rng = createRng((seed ^ PLACEMENT_SALT) >>> 0);
  const reach = reachableFrom(map, map.spawn);
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
      if (reach.has(`${x},${y}`) && !taken.has(`${x},${y}`) && !exitAt(map, p) && far(p)) candidates.push(p);
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }
  if (candidates.length < count) throw new Error(`Gruta (seed ${seed}): só couberam ${candidates.length} de ${count} monstros`);
  return candidates.slice(0, count);
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
