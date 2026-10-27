import type { ClassStats, Progression } from '../content/schemas.ts';

export interface CharacterStats {
  maxHp: number;
  maxMana: number;
  attack: number;
  defense: number;
}

/** XP total para chegar ao nível `level` (nível 0 = 0 XP). */
export function totalXpForLevel(level: number, curve: Progression['xpCurve']): number {
  let total = 0;
  for (let l = 0; l < level; l++) total += Math.round(curve.base * (l + 1) ** curve.exponent);
  return total;
}

/** Tabela "nível -> XP total" de 0 até o nível máximo. O banco guarda uma cópia (level_thresholds). */
export function levelThresholds(curve: Progression['xpCurve'], maxLevel: number): number[] {
  return Array.from({ length: maxLevel + 1 }, (_, level) => totalXpForLevel(level, curve));
}

export function levelForXp(xp: number, thresholds: number[]): number {
  let level = 0;
  while (level + 1 < thresholds.length && xp >= thresholds[level + 1]!) level++;
  return level;
}

export function statsForLevel(classStats: ClassStats, level: number): CharacterStats {
  const { base, perLevel } = classStats;
  return {
    maxHp: Math.round(base.hp + perLevel.hp * level),
    maxMana: Math.round(base.mana + perLevel.mana * level),
    attack: base.attack + perLevel.attack * level,
    defense: base.defense + perLevel.defense * level,
  };
}
