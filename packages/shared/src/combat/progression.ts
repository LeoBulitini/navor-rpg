import type { Classes, PathStats, Progression } from '../content/schemas.ts';

export interface CharacterStats {
  maxHp: number;
  maxMana: number;
  physAttack: number;
  physDefense: number;
  magAttack: number;
  magDefense: number;
  precision: number;
  critChance: number;
  critDamage: number;
  moveSpeedTilesPerSecond: number;
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

export function statsForLevel(path: PathStats, level: number): CharacterStats {
  const { base, perLevel } = path;
  const at = (k: keyof PathStats['perLevel']) => base[k] + perLevel[k] * level;
  return {
    maxHp: Math.round(at('hp')),
    maxMana: Math.round(at('mana')),
    physAttack: at('physAttack'),
    physDefense: at('physDefense'),
    magAttack: at('magAttack'),
    magDefense: at('magDefense'),
    precision: at('precision'),
    critChance: Math.min(1, at('critChance')),
    critDamage: at('critDamage'),
    moveSpeedTilesPerSecond: base.moveSpeedTilesPerSecond,
  };
}

/** Caminho (magic, melee, ranged) de uma classe, pela tabela de classes.json. */
export function pathOfClass(classes: Classes, classId: string): string {
  const path = classes.paths.find((p) => p.stages.some((s) => s.classId === classId));
  if (!path) throw new Error(`Classe desconhecida: ${classId}`);
  return path.id;
}

export function pathStatsFor(progression: Progression, pathId: string): PathStats {
  const ps = progression.pathStats.find((p) => p.pathId === pathId);
  if (!ps) throw new Error(`Sem atributos para o caminho ${pathId}`);
  return ps;
}
