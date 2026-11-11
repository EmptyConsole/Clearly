// Level conversions (RULES.md: levels are dBFS; gain = 10^(dB/20)). No imports, so worklets can
// bundle this file without pulling in anything else.

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

export function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(gain, 1e-12));
}

/** Smallest power of two that is at least n. */
export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}
