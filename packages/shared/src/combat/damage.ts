import type { Combat } from '../content/schemas.ts';
import type { Rng } from '../procgen/rng.ts';

export interface Hit {
  amount: number;
  crit: boolean;
}

/**
 * Dano de um golpe: ataque com variação de ±damageVariance, menos defesa × defenseFactor,
 * mínimo 1, e crítico com chance critChance que multiplica por critMultiplier.
 */
export function rollDamage(attack: number, defense: number, combat: Combat, rng: Rng): Hit {
  const variance = 1 + (rng.next() * 2 - 1) * combat.damageVariance;
  const crit = rng.next() < combat.critChance;
  const raw = attack * variance - defense * combat.defenseFactor;
  return { amount: Math.max(1, Math.round(raw * (crit ? combat.critMultiplier : 1))), crit };
}

/** Teto de dano por segundo que o servidor aceita para um personagem desse nível. */
export function serverMaxDps(combat: Combat, level: number): number {
  return combat.server.maxDamagePerSecond.base + combat.server.maxDamagePerSecond.perLevel * level;
}
