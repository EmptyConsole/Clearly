// Biquad magnitude responses exactly as the Web Audio API defines them (W3C Web Audio API 1.1,
// section 1.13.5 "Filters Characteristics", read 2026-11-09):
//   A = 10^(G/40), w0 = 2 pi f0 / Fs, alpha_Q = sin(w0) / (2Q)  (peaking uses linear Q),
//   alpha_S = sin(w0)/2 * sqrt((A + 1/A)(1/S - 1) + 2) with S = 1  (shelves ignore Q),
//   lowpass: alpha_QdB = sin(w0) / (2 * 10^(Q/20)) (Web Audio's lowpass Q is in dB) and no gain.
// H(z) = (b0 + b1 z^-1 + b2 z^-2) / (a0 + a1 z^-1 + a2 z^-2).

export type BiquadType = 'peaking' | 'highshelf' | 'lowshelf' | 'lowpass';

export interface BiquadSpec {
  readonly type: BiquadType;
  readonly frequencyHz: number;
  readonly gainDb: number;
  /** Peaking: linear Q. Lowpass: Q in dB (Web Audio). Ignored for shelves. */
  readonly q: number;
}

export interface BiquadCoefficients {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a0: number;
  readonly a1: number;
  readonly a2: number;
}

export function biquadCoefficients(spec: BiquadSpec, sampleRateHz: number): BiquadCoefficients {
  const A = 10 ** (spec.gainDb / 40);
  const w0 = (2 * Math.PI * spec.frequencyHz) / sampleRateHz;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  if (spec.type === 'peaking') {
    const alpha = sin / (2 * spec.q);
    return {
      b0: 1 + alpha * A,
      b1: -2 * cos,
      b2: 1 - alpha * A,
      a0: 1 + alpha / A,
      a1: -2 * cos,
      a2: 1 - alpha / A,
    };
  }
  if (spec.type === 'lowpass') {
    const alpha = sin / (2 * 10 ** (spec.q / 20));
    return {
      b0: (1 - cos) / 2,
      b1: 1 - cos,
      b2: (1 - cos) / 2,
      a0: 1 + alpha,
      a1: -2 * cos,
      a2: 1 - alpha,
    };
  }
  const alphaS = (sin / 2) * Math.SQRT2;
  const sqA = Math.sqrt(A);
  if (spec.type === 'lowshelf') {
    return {
      b0: A * (A + 1 - (A - 1) * cos + 2 * alphaS * sqA),
      b1: 2 * A * (A - 1 - (A + 1) * cos),
      b2: A * (A + 1 - (A - 1) * cos - 2 * alphaS * sqA),
      a0: A + 1 + (A - 1) * cos + 2 * alphaS * sqA,
      a1: -2 * (A - 1 + (A + 1) * cos),
      a2: A + 1 + (A - 1) * cos - 2 * alphaS * sqA,
    };
  }
  return {
    b0: A * (A + 1 + (A - 1) * cos + 2 * alphaS * sqA),
    b1: -2 * A * (A - 1 + (A + 1) * cos),
    b2: A * (A + 1 + (A - 1) * cos - 2 * alphaS * sqA),
    a0: A + 1 - (A - 1) * cos + 2 * alphaS * sqA,
    a1: 2 * (A - 1 - (A + 1) * cos),
    a2: A + 1 - (A - 1) * cos - 2 * alphaS * sqA,
  };
}

/** cos w, sin w, cos 2w, sin 2w for one frequency: precompute these for a fixed grid. */
export interface FrequencyPoint {
  readonly c1: number;
  readonly s1: number;
  readonly c2: number;
  readonly s2: number;
}

export function frequencyPoint(hz: number, sampleRateHz: number): FrequencyPoint {
  const w = (2 * Math.PI * hz) / sampleRateHz;
  return { c1: Math.cos(w), s1: Math.sin(w), c2: Math.cos(2 * w), s2: Math.sin(2 * w) };
}

/** |H(e^jw)| in dB at a precomputed frequency point. */
export function biquadMagnitudeDbAt(c: BiquadCoefficients, p: FrequencyPoint): number {
  const nr = c.b0 + c.b1 * p.c1 + c.b2 * p.c2;
  const ni = -(c.b1 * p.s1 + c.b2 * p.s2);
  const dr = c.a0 + c.a1 * p.c1 + c.a2 * p.c2;
  const di = -(c.a1 * p.s1 + c.a2 * p.s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

/** |H(e^jw)| in dB at frequency hz. */
export function biquadMagnitudeDb(c: BiquadCoefficients, hz: number, sampleRateHz: number): number {
  return biquadMagnitudeDbAt(c, frequencyPoint(hz, sampleRateHz));
}
