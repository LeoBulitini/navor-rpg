/** Gerador pseudoaleatório determinístico (mulberry32): mesma seed, mesma sequência, em qualquer plataforma. */
export interface Rng {
  /** número em [0, 1) */
  next(): number;
  /** inteiro em [min, max], inclusive */
  int(min: number, max: number): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (min, max) => min + Math.floor(next() * (max - min + 1)) };
}
