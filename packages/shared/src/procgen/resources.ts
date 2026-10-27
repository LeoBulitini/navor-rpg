import type { Items, ResourcesConfig } from '../content/schemas.ts';
import { exitAt, reachableFrom, type GridPoint, type ParsedMap } from '../map/tilemap.ts';
import { createRng, type Rng } from './rng.ts';

/** O que um ponto de coleta dá. No jogo online, quem decide é o servidor (start_exploration). */
export interface NodeContent {
  index: number;
  itemId: string;
  quantity: number;
}

/** Mistura fixa para a posição dos pontos não repetir a sequência usada pelo gerador do mapa. */
const PLACEMENT_SALT = 0x5bd1e995;

/**
 * Posições dos pontos de coleta de uma Gruta, em células. Só dependem da seed e da quantidade,
 * então o navegador chega às mesmas posições em qualquer recarga. O ponto n.º i fica em result[i].
 * Regras: chão alcançável, fora das saídas, a `clearance` tiles da entrada, da saída e do nascimento,
 * e a pelo menos `minDistance` tiles (Chebyshev) um do outro.
 */
export function placeResourceNodes(map: ParsedMap, seed: number, count: number, config: ResourcesConfig): GridPoint[] {
  const rng = createRng((seed ^ PLACEMENT_SALT) >>> 0);
  const reach = reachableFrom(map, map.spawn);
  const keepAway: GridPoint[] = [map.spawn];
  for (const e of map.exits) {
    for (let y = e.y; y < e.y + e.h; y++) for (let x = e.x; x < e.x + e.w; x++) keepAway.push({ x, y });
  }
  const far = (p: GridPoint, from: GridPoint[], min: number) => from.every((q) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) >= min);

  const candidates: GridPoint[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const p = { x, y };
      if (reach.has(`${x},${y}`) && !exitAt(map, p) && far(p, keepAway, config.clearance)) candidates.push(p);
    }
  }
  shuffle(candidates, rng);

  const chosen: GridPoint[] = [];
  for (const p of candidates) {
    if (chosen.length === count) break;
    if (far(p, chosen, config.minDistance)) chosen.push(p);
  }
  if (chosen.length < count) throw new Error(`Gruta (seed ${seed}): só couberam ${chosen.length} de ${count} pontos de coleta`);
  return chosen;
}

/**
 * Sorteia o conteúdo dos pontos: quantidade de pontos, raridade pelo peso, um item daquela raridade
 * e a quantidade pela faixa da raridade. É a mesma regra da função start_exploration do banco;
 * aqui serve ao modo offline (nada é salvo) e aos testes.
 */
export function rollResourceNodes(config: ResourcesConfig, items: Items, rng: Rng): NodeContent[] {
  const rarityOf = new Map(items.items.map((i) => [i.id, i.rarity]));
  const total = config.rarities.reduce((sum, r) => sum + r.weight, 0);
  const count = rng.int(config.nodes.min, config.nodes.max);
  const nodes: NodeContent[] = [];
  for (let index = 0; index < count; index++) {
    let pick = rng.next() * total;
    const rule = config.rarities.find((r) => (pick -= r.weight) < 0) ?? config.rarities[config.rarities.length - 1]!;
    const pool = config.items.filter((id) => rarityOf.get(id) === rule.rarity);
    nodes.push({
      index,
      itemId: pool[rng.int(0, pool.length - 1)]!,
      quantity: rng.int(rule.quantity.min, rule.quantity.max),
    });
  }
  return nodes;
}

function shuffle<T>(list: T[], rng: Rng): void {
  for (let i = list.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
}
