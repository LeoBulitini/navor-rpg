import type { ChestsConfig } from '../content/schemas.ts';
import type { GridPoint, ParsedMap } from '../map/tilemap.ts';
import { placeMonsters } from './creatures.ts';
import type { Rng } from './rng.ts';

export interface ChestContents {
  copper: number;
  gold: number;
  drops: { itemId: string; quantity: number }[];
}

const CHEST_SALT = 0x9e3779b9;

/**
 * Posições dos baús, a partir da seed: sempre no fundo da área (recompensa por explorar),
 * longe da entrada e fora das células em `avoid` (pontos de coleta e monstros).
 */
export function placeChests(map: ParsedMap, seed: number, count: number, config: ChestsConfig, avoid: GridPoint[] = []): GridPoint[] {
  return placeMonsters(map, seed, count, config, avoid, () => true, CHEST_SALT);
}

/** Quantos baús uma entrada tem. É a mesma regra de start_exploration; aqui serve ao modo offline. */
export function rollChestCount(config: ChestsConfig, rng: Rng): number {
  return rng.int(config.count.min, config.count.max);
}

/** Conteúdo de um baú. É a mesma regra de open_chest; aqui serve ao modo offline. */
export function rollChestContents(config: ChestsConfig, rng: Rng, dropMultiplier = 1): ChestContents {
  const copper = rng.int(config.copper.min, config.copper.max);
  const gold = rng.next() < config.goldChance ? 1 : 0;
  const drops = config.items
    .filter((d) => rng.next() < Math.min(1, d.chance * dropMultiplier))
    .map((d) => ({ itemId: d.item, quantity: rng.int(d.quantity.min, d.quantity.max) }));
  return { copper, gold, drops };
}
