// Digit recordings for the speech-in-noise check (M08): trimmed to their onset and equalised to
// the same RMS, so only the SNR changes from triplet to triplet. Pure, Node-testable.

/** Every digit is scaled to this RMS (measured over its non-silent part). */
export const DIGIT_RMS_DBFS = -20;
/** Onset: the first sample above this level, less 10 ms of lead-in. */
export const DIGIT_ONSET_DBFS = -40;
const LEAD_MS = 10;

export function rmsDbfsOf(x: Float32Array): number {
  let p = 0;
  for (const v of x) p += v * v;
  return x.length > 0 && p > 0 ? 10 * Math.log10(p / x.length) : -Infinity;
}

/** Trims silence at both ends (10 ms margins) and scales to DIGIT_RMS_DBFS. */
export function prepareDigit(x: Float32Array, sampleRate: number): Float32Array {
  const thr = 10 ** (DIGIT_ONSET_DBFS / 20);
  let first = 0;
  while (first < x.length && Math.abs(x[first] ?? 0) < thr) first++;
  let last = x.length - 1;
  while (last > first && Math.abs(x[last] ?? 0) < thr) last--;
  const lead = Math.round((LEAD_MS * sampleRate) / 1000);
  const trimmed = x.slice(Math.max(0, first - lead), Math.min(x.length, last + lead + 1));
  const rms = rmsDbfsOf(trimmed);
  if (!Number.isFinite(rms)) return trimmed;
  const g = 10 ** ((DIGIT_RMS_DBFS - rms) / 20);
  return trimmed.map((v) => v * g);
}
