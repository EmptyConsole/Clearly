// Discontinuity (click) detector. Pure function, no DOM.
//
// A click is a sudden change of slope: the second difference d2[n] = x[n] - 2 x[n-1] + x[n-2]
// jumps far outside its local distribution. The local scale is robust: the median absolute
// deviation of d2 in a centred window (CLICK_SCALE_WINDOW samples), recomputed every
// CLICK_SCALE_BLOCK samples, times 1.4826 to estimate a standard deviation. A sample is flagged when
// |d2 - median| exceeds CLICK_THRESHOLD_SIGMAS of that scale and an absolute floor (so numerical
// noise in near-silence is ignored). Flags within CLICK_MERGE_MS are merged into one event whose
// severity is the largest ratio found.
//
// Digital silence: a median is zero when more than half its window is silent (the end of a fade,
// the start of a file), which would make the sound next to the silence look infinitely severe. So
// the scale is computed over the window's non-silent samples. When fewer than MIN_SOUNDING remain,
// the scale is zero and only the absolute floor applies: any real spike in silence is a click.

import {
  CLICK_ABSOLUTE_FLOOR,
  CLICK_MERGE_MS,
  CLICK_SCALE_BLOCK,
  CLICK_SCALE_WINDOW,
  CLICK_THRESHOLD_SIGMAS,
  MAD_TO_SD,
} from '../constants.ts';

/** |d2| below this is digital silence (about -160 dBFS). */
const SILENT_D2 = 1e-8;
const MIN_SOUNDING = 32;

export interface Discontinuity {
  readonly channel: number;
  /** Sample index of the strongest flagged sample in the event. */
  readonly sample: number;
  readonly timeS: number;
  /** |d2 - median| divided by the robust scale. */
  readonly severity: number;
  /** |d2 - median| in dBFS (size of the slope jump). */
  readonly jumpDbfs: number;
}

export interface DetectorOptions {
  readonly thresholdSigmas?: number;
  readonly absoluteFloor?: number;
  readonly window?: number;
  readonly block?: number;
  readonly mergeMs?: number;
  /** Ignore this many samples at each end (filter warm-up, fades). */
  readonly ignoreEdges?: number;
}

/** In-place quickselect: the k-th smallest of a[0..n). */
function select(a: Float64Array, n: number, k: number): number {
  let lo = 0;
  let hi = n - 1;
  while (hi > lo) {
    const pivot = a[(lo + hi) >> 1] ?? 0;
    let i = lo;
    let j = hi;
    while (i <= j) {
      while ((a[i] ?? 0) < pivot) i++;
      while ((a[j] ?? 0) > pivot) j--;
      if (i <= j) {
        const t = a[i] ?? 0;
        a[i] = a[j] ?? 0;
        a[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return a[k] ?? 0;
  }
  return a[k] ?? 0;
}

function median(a: Float64Array, n: number): number {
  return select(a, n, n >> 1);
}

export function detectDiscontinuities(
  channels: readonly Float32Array[],
  sampleRate: number,
  options: DetectorOptions = {},
): Discontinuity[] {
  const sigmas = options.thresholdSigmas ?? CLICK_THRESHOLD_SIGMAS;
  const floor = options.absoluteFloor ?? CLICK_ABSOLUTE_FLOOR;
  const window = options.window ?? CLICK_SCALE_WINDOW;
  const block = options.block ?? CLICK_SCALE_BLOCK;
  const mergeFrames = Math.round(((options.mergeMs ?? CLICK_MERGE_MS) * sampleRate) / 1000);
  const edges = options.ignoreEdges ?? 0;
  const events: Discontinuity[] = [];
  const scratch = new Float64Array(window);

  channels.forEach((x, channel) => {
    const n = x.length;
    if (n < 3) return;
    const d2 = new Float64Array(n);
    for (let i = 2; i < n; i++) d2[i] = (x[i] ?? 0) - 2 * (x[i - 1] ?? 0) + (x[i - 2] ?? 0);

    let current: { sample: number; severity: number; jump: number; last: number } | null = null;
    const flush = () => {
      if (!current) return;
      events.push({
        channel,
        sample: current.sample,
        timeS: current.sample / sampleRate,
        severity: current.severity,
        jumpDbfs: 20 * Math.log10(current.jump),
      });
      current = null;
    };

    for (let start = 2; start < n; start += block) {
      const end = Math.min(n, start + block);
      // Centred window around this block.
      const centre = (start + end) >> 1;
      const w0 = Math.max(2, Math.min(n - window, centre - (window >> 1)));
      const w1 = Math.min(n, w0 + window);
      let len = 0;
      for (let i = w0; i < w1; i++) {
        const v = d2[i] ?? 0;
        if (Math.abs(v) >= SILENT_D2) scratch[len++] = v;
      }
      let med = 0;
      let scale = 0;
      if (len >= MIN_SOUNDING) {
        const sounding = len;
        med = median(scratch, sounding);
        len = 0;
        for (let i = w0; i < w1; i++) {
          const v = d2[i] ?? 0;
          if (Math.abs(v) >= SILENT_D2) scratch[len++] = Math.abs(v - med);
        }
        scale = MAD_TO_SD * median(scratch, len);
      }
      for (let i = start; i < end; i++) {
        if (i < edges || i >= n - edges) continue;
        const dev = Math.abs((d2[i] ?? 0) - med);
        if (dev <= floor) continue;
        const ratio = scale > 0 ? dev / scale : Infinity;
        if (ratio <= sigmas) continue;
        if (current && i - current.last <= mergeFrames) {
          current.last = i;
          if (ratio > current.severity) {
            current.severity = ratio;
            current.sample = i;
            current.jump = dev;
          }
        } else {
          flush();
          current = { sample: i, severity: ratio, jump: dev, last: i };
        }
      }
    }
    flush();
  });
  return events.sort((a, b) => a.sample - b.sample);
}
