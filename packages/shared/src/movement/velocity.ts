export interface DirectionInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export type Facing = 'down' | 'left' | 'right' | 'up';

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

/**
 * Direção para escolher a animação. Na diagonal mantém a direção atual se ela
 * ainda fizer parte do movimento, evitando o sprite "piscar" entre direções.
 */
export function facingFromVelocity(v: Velocity, current: Facing): Facing {
  if (v.vx === 0 && v.vy === 0) return current;
  const horizontal: Facing | null = v.vx < 0 ? 'left' : v.vx > 0 ? 'right' : null;
  const vertical: Facing | null = v.vy < 0 ? 'up' : v.vy > 0 ? 'down' : null;
  if (horizontal && vertical) return current === horizontal || current === vertical ? current : horizontal;
  return (horizontal ?? vertical)!;
}

export function tilesPerSecondToPixels(tilesPerSecond: number, tileSize: number): number {
  return tilesPerSecond * tileSize;
}
