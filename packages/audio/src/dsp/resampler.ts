// Streaming sample-rate converter for file export (M05): a Kaiser-windowed sinc, evaluated from a
// 1024-phase table with linear interpolation between phases. Chunk boundaries do not matter (the
// history is carried), so a file decoded in pieces resamples exactly as if it were one block.
// Zero delay: output frame n is centred on input position n * inRate / outRate. The output length
// is round(inputFrames * outRate / inRate).

const PHASES = 1024;

function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  for (let k = 1; k < 50; k++) {
    term *= (x / (2 * k)) ** 2;
    sum += term;
    if (term < 1e-12 * sum) break;
  }
  return sum;
}

export interface ResamplerOptions {
  /** Taps on each side of the centre (default 24). */
  readonly halfTaps?: number;
  /** Kaiser beta (default 8.6: about 90 dB stop-band). */
  readonly beta?: number;
}

export class StreamResampler {
  readonly step: number;
  private readonly H: number;
  private readonly table: Float32Array;
  private buf: Float32Array[];
  /** Absolute input index of buf[c][0]. */
  private bufStart: number;
  private inFrames = 0;
  private outIndex = 0;

  constructor(
    readonly inRate: number,
    readonly outRate: number,
    readonly channels: number,
    o: ResamplerOptions = {},
  ) {
    this.step = inRate / outRate;
    this.H = o.halfTaps ?? 24;
    const beta = o.beta ?? 8.6;
    // Cutoff below the lower Nyquist, with a small transition band.
    const cutoff = Math.min(1, outRate / inRate) * 0.95;
    const n = 2 * this.H * PHASES + 1;
    this.table = new Float32Array(n + 1);
    const i0b = besselI0(beta);
    for (let i = 0; i < n; i++) {
      const t = i / PHASES - this.H; // in input samples
      const x = Math.PI * t * cutoff;
      const sinc = t === 0 ? 1 : Math.sin(x) / x;
      const r = t / this.H;
      const w = Math.abs(r) <= 1 ? besselI0(beta * Math.sqrt(1 - r * r)) / i0b : 0;
      this.table[i] = cutoff * sinc * w;
    }
    // H samples of silence before the start, so the first outputs see a full window.
    this.buf = Array.from({ length: channels }, () => new Float32Array(0));
    this.bufStart = 0;
  }

  /** Kernel value at offset t (input samples) from the centre, |t| <= H. */
  private h(t: number): number {
    const pos = (t + this.H) * PHASES;
    const i = Math.floor(pos);
    const f = pos - i;
    const a = this.table[i] ?? 0;
    const b = this.table[i + 1] ?? 0;
    return a + (b - a) * f;
  }

  private sample(c: number, abs: number): number {
    const buf = this.buf[c];
    if (!buf) return 0;
    const i = abs - this.bufStart;
    return i >= 0 && i < buf.length ? (buf[i] ?? 0) : 0;
  }

  private produce(limitOut: number, available: number): Float32Array[] {
    const out: number[][] = Array.from({ length: this.channels }, () => []);
    while (this.outIndex < limitOut) {
      const p = this.outIndex * this.step;
      const i0 = Math.floor(p);
      if (i0 + this.H >= available) break;
      const frac = p - i0;
      for (let c = 0; c < this.channels; c++) {
        let acc = 0;
        for (let k = -this.H + 1; k <= this.H; k++)
          acc += this.sample(c, i0 + k) * this.h(k - frac);
        out[c]?.push(acc);
      }
      this.outIndex++;
    }
    // Drop history no longer needed.
    const keepFrom = Math.max(0, Math.floor(this.outIndex * this.step) - this.H);
    const drop = keepFrom - this.bufStart;
    if (drop > 0) {
      this.buf = this.buf.map((b) => b.slice(Math.min(drop, b.length)));
      this.bufStart += drop;
    }
    return out.map((a) => Float32Array.from(a));
  }

  /** Feeds input frames (one array per channel, equal lengths) and returns what is ready. */
  push(input: readonly Float32Array[]): Float32Array[] {
    const n = input[0]?.length ?? 0;
    this.buf = this.buf.map((b, c) => {
      const next = new Float32Array(b.length + n);
      next.set(b);
      next.set(input[c] ?? input[0] ?? new Float32Array(n), b.length);
      return next;
    });
    this.inFrames += n;
    return this.produce(Number.POSITIVE_INFINITY, this.inFrames);
  }

  /** Total output frames for the input seen so far. */
  get expectedOutFrames(): number {
    return Math.round((this.inFrames * this.outRate) / this.inRate);
  }

  /** Emits the remaining frames (the input is treated as followed by silence). */
  flush(): Float32Array[] {
    return this.produce(this.expectedOutFrames, Number.POSITIVE_INFINITY);
  }
}
