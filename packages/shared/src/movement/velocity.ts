export interface DirectionInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

/** As 8 direções da arte (os nomes batem com os arquivos south.png, north-east.png...). */
export const FACINGS = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east'] as const;
export type Facing = (typeof FACINGS)[number];

export interface Velocity {
  vx: number;
  vy: number;
}

/**
 * Movimento livre em 8 direções. A diagonal é normalizada para que andar
 * na diagonal não seja mais rápido que em linha reta.
 */
export function velocityFromInput(input: DirectionInput, speed: number): Velocity {
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dx === 0 && dy === 0) return { vx: 0, vy: 0 };
  const len = Math.hypot(dx, dy);
  return { vx: (dx / len) * speed, vy: (dy / len) * speed };
}

/** Direção para escolher o sprite: cada uma das 8 direções de movimento tem o seu. */
export function facingFromVelocity(v: Velocity, current: Facing): Facing {
  if (v.vx === 0 && v.vy === 0) return current;
  const vertical = v.vy < 0 ? 'north' : v.vy > 0 ? 'south' : '';
  const horizontal = v.vx < 0 ? 'west' : v.vx > 0 ? 'east' : '';
  return [vertical, horizontal].filter(Boolean).join('-') as Facing;
}

export function tilesPerSecondToPixels(tilesPerSecond: number, tileSize: number): number {
  return tilesPerSecond * tileSize;
}

/** Vetor unitário de uma direção (para onde o jogador está virado, ex.: direção do projétil). */
export function facingVector(facing: Facing): Velocity {
  const dx = facing.includes('east') ? 1 : facing.includes('west') ? -1 : 0;
  const dy = facing.includes('south') ? 1 : facing.includes('north') ? -1 : 0;
  const len = Math.hypot(dx, dy);
  return { vx: dx / len, vy: dy / len };
}
