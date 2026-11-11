// Seeded pseudo-random numbers. All randomness in core goes through an Rng so that every run,
// test and simulation is reproducible from its seed.

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
}

/**
 * sfc32 (Chris Doty-Humphrey's Small Fast Counter, from PractRand), seeded with splitmix32.
 * Passes PractRand to large sizes, needs only 32-bit integer maths, and is tiny.
 */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const splitmix = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = splitmix();
  let b = splitmix();
  let c = splitmix();
  let d = splitmix();
  const rng: Rng = {
    next() {
      const t = (((a + b) >>> 0) + d) >>> 0;
      d = (d + 1) >>> 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) >>> 0;
      c = ((c << 21) | (c >>> 11)) >>> 0;
      c = (c + t) >>> 0;
      return t / 4294967296;
    },
  };
  // Discard the first outputs, as recommended for sfc32.
  for (let i = 0; i < 12; i++) rng.next();
  return rng;
}

export function uniform(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng.next();
}

/** Integer in [0, n). */
export function randomInt(rng: Rng, n: number): number {
  return Math.floor(rng.next() * n);
}

/** Standard normal via Box-Muller. */
export function normal(rng: Rng, mean = 0, sd = 1): number {
  let u = rng.next();
  while (u <= Number.EPSILON) u = rng.next();
  const v = rng.next();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[randomInt(rng, items.length)];
  if (item === undefined) throw new Error('pick from an empty list');
  return item;
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
