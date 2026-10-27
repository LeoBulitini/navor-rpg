import type { Combat, DamageType } from '../content/schemas.ts';
import type { Rng } from '../procgen/rng.ts';

export interface Hit {
  amount: number;
  crit: boolean;
}

export interface CritStats {
  critChance: number;
  critDamage: number;
}

/**
 * Dano de um golpe: ataque com variação de ±damageVariance, menos defesa × defenseFactor (menos a
 * parte que a penetração ignora), mínimo 1, e crítico com a chance e o multiplicador de quem ataca.
 */
export function rollDamage(attack: number, defense: number, crit: CritStats, combat: Combat, rng: Rng, penetration = 0): Hit {
  const variance = 1 + (rng.next() * 2 - 1) * combat.damageVariance;
  const isCrit = rng.next() < crit.critChance;
  const raw = attack * variance - defense * (1 - Math.min(1, penetration)) * combat.defenseFactor;
  return { amount: Math.max(1, Math.round(raw * (isCrit ? crit.critDamage : 1))), crit: isCrit };
}

/** Chance de acertar: baseHitChance + precisão × hitPerPrecision, no máximo 100%. */
export function hitChance(precision: number, combat: Combat): number {
  return Math.min(1, combat.baseHitChance + precision * combat.hitPerPrecision);
}

export function rollHit(precision: number, combat: Combat, rng: Rng): boolean {
  return rng.next() < hitChance(precision, combat);
}

/** Ataque e defesa que valem para um tipo de dano. */
export function attackFor(stats: { physAttack: number; magAttack: number }, type: DamageType): number {
  return type === 'physical' ? stats.physAttack : stats.magAttack;
}

export function defenseFor(stats: { physDefense: number; magDefense: number }, type: DamageType): number {
  return type === 'physical' ? stats.physDefense : stats.magDefense;
}

/**
 * Teto de dano por segundo que o servidor aceita: nível, ataque dos equipamentos e pontos de habilidade gastos.
 * Mesma conta de kill_monster no banco.
 */
export function serverMaxDps(combat: Combat, level: number, gearAttack = 0, skillPoints = 0): number {
  const m = combat.server.maxDamagePerSecond;
  return (m.base + m.perLevel * level + m.perAttackBonus * gearAttack) * (1 + (m.perSkillPointPercent * skillPoints) / 100);
}
