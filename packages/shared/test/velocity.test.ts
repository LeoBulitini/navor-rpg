import { describe, expect, it } from 'vitest';
import { facingFromVelocity, velocityFromInput, tilesPerSecondToPixels } from '../src/index.ts';

const none = { left: false, right: false, up: false, down: false };

describe('velocityFromInput', () => {
  it('parado sem teclas', () => {
    expect(velocityFromInput(none, 128)).toEqual({ vx: 0, vy: 0 });
  });

  it('teclas opostas se anulam', () => {
    expect(velocityFromInput({ ...none, left: true, right: true }, 128)).toEqual({ vx: 0, vy: 0 });
  });

  it('linha reta usa a velocidade cheia', () => {
    expect(velocityFromInput({ ...none, right: true }, 128)).toEqual({ vx: 128, vy: 0 });
    expect(velocityFromInput({ ...none, up: true }, 128)).toEqual({ vx: 0, vy: -128 });
  });

  it('diagonal é normalizada (não anda mais rápido)', () => {
    const v = velocityFromInput({ ...none, right: true, down: true }, 128);
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(128, 6);
    expect(v.vx).toBeCloseTo(v.vy, 6);
  });
});

describe('facingFromVelocity', () => {
  it('mantém a direção quando parado', () => {
    expect(facingFromVelocity({ vx: 0, vy: 0 }, 'up')).toBe('up');
  });
  it('segue o eixo em linha reta', () => {
    expect(facingFromVelocity({ vx: -1, vy: 0 }, 'down')).toBe('left');
    expect(facingFromVelocity({ vx: 0, vy: 1 }, 'up')).toBe('down');
  });
  it('na diagonal mantém a direção atual se ela fizer parte do movimento', () => {
    expect(facingFromVelocity({ vx: 1, vy: -1 }, 'up')).toBe('up');
    expect(facingFromVelocity({ vx: 1, vy: -1 }, 'down')).toBe('right');
  });
});

it('converte 4 tiles/s em 128 px/s com tile de 32', () => {
  expect(tilesPerSecondToPixels(4, 32)).toBe(128);
});
