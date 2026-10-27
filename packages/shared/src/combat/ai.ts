import type { CreatureDef } from '../content/schemas.ts';

export type MonsterIntent = 'idle' | 'chase' | 'attack' | 'return' | 'flee';

export interface Point {
  x: number;
  y: number;
}

/** Quanto, além da detecção, o monstro persegue antes de desistir e voltar para casa. */
export const LEASH_FACTOR = 2;

/**
 * IA simples dos monstros, em tiles: ataca se o jogador está ao alcance, persegue se está a até
 * `detectTiles`, desiste se se afastou mais de `detectTiles × LEASH_FACTOR` de casa, e senão volta.
 * Animais dóceis (`behavior: 'flee'`) fogem enquanto o jogador está a até `detectTiles` e depois
 * ficam parados onde pararam (não voltam para casa, o que os levaria de volta ao jogador).
 */
export function monsterIntent(creature: CreatureDef, monster: Point, home: Point, player: Point | null, chasing: boolean): MonsterIntent {
  if (creature.behavior === 'flee') {
    return player && Math.hypot(player.x - monster.x, player.y - monster.y) <= creature.detectTiles ? 'flee' : 'idle';
  }
  const fromHome = Math.hypot(monster.x - home.x, monster.y - home.y);
  const leash = creature.detectTiles * LEASH_FACTOR;
  if (player) {
    const toPlayer = Math.hypot(player.x - monster.x, player.y - monster.y);
    if (toPlayer <= creature.attackRangeTiles) return 'attack';
    if (fromHome <= leash && (toPlayer <= creature.detectTiles || (chasing && toPlayer <= leash))) return 'chase';
  }
  return fromHome > 0.25 ? 'return' : 'idle';
}
