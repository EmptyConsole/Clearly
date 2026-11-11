import { describe, expect, it } from 'vitest';
import {
  CALM_RMS_DBFS,
  CalmGenerator,
  calmCapDbfs,
  calmGain,
  pitchStep,
  type CalmKind,
} from './calm.ts';
import { blackmanSpectrumDb } from './humDetect.ts';

const SR = 48000;
const FFT = 8192;

function render(kind: CalmKind, seconds: number, pitch = 6000): Float32Array {
  const g = new CalmGenerator(kind, SR, pitch, 3);
  const n = Math.round(SR * seconds);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  g.fill(l, r);
  return l;
}

/** Averaged power spectrum in dB. */
function spectrum(x: Float32Array): Float64Array {
  const acc = new Float64Array(FFT / 2);
  let frames = 0;
  for (let o = SR; o + FFT <= x.length; o += FFT / 2) {
    const db = blackmanSpectrumDb(x.subarray(o, o + FFT), FFT);
    for (let i = 0; i < acc.length; i++) acc[i] = (acc[i] ?? 0) + 10 ** ((db[i] ?? -240) / 10);
    frames++;
  }
  return acc.map((p) => 10 * Math.log10(p / frames + 1e-30));
}

/** Mean power (dB) in a band. */
function band(s: Float64Array, lo: number, hi: number): number {
  const bin = SR / FFT;
  let p = 0;
  let n = 0;
  for (let i = Math.ceil(lo / bin); i <= Math.floor(hi / bin); i++) {
    p += 10 ** ((s[i] ?? -300) / 10);
    n++;
  }
  return 10 * Math.log10(p / n);
}

/** Slope in dB per octave from octave bands between 125 Hz and 8 kHz (least squares). */
function slope(s: Float64Array): number {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let f = 125; f <= 8000; f *= 2) {
    xs.push(Math.log2(f));
    ys.push(band(s, f / Math.SQRT2, f * Math.SQRT2));
  }
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * ((ys[i] ?? 0) - my);
    den += (x - mx) ** 2;
  });
  return num / den;
}

const rmsDb = (x: Float32Array, from = 0) => {
  let p = 0;
  for (let i = from; i < x.length; i++) p += (x[i] ?? 0) ** 2;
  return 10 * Math.log10(p / (x.length - from));
};

describe('Calm Sounds generators', () => {
  // Band-power mean over an octave band of noise with slope s per octave grows by s per octave,
  // and a flat (white) band's mean power is the same in every band.
  it('white is flat', () => {
    expect(Math.abs(slope(spectrum(render('white', 8))))).toBeLessThan(0.5);
  });
  it('pink falls 3 dB per octave', () => {
    expect(slope(spectrum(render('pink', 8)))).toBeCloseTo(-3, 0);
  });
  it('brown falls 6 dB per octave', () => {
    expect(slope(spectrum(render('brown', 8)))).toBeCloseTo(-6, 0);
  });
  it('rain is band-limited to 500 to 8000 Hz', () => {
    const s = spectrum(render('rain', 8));
    const inBand = band(s, 1000, 4000);
    expect(inBand - band(s, 60, 150)).toBeGreaterThan(15);
    expect(inBand - band(s, 16000, 20000)).toBeGreaterThan(15);
  });
  it('ocean swells at 0.1 Hz', () => {
    const x = render('ocean', 40);
    // Envelope: RMS per 0.5 s, then the strongest period between 4 and 20 s.
    const hop = SR / 2;
    const env: number[] = [];
    for (let o = 0; o + hop <= x.length; o += hop) {
      let p = 0;
      for (let i = o; i < o + hop; i++) p += (x[i] ?? 0) ** 2;
      env.push(Math.sqrt(p / hop));
    }
    const mean = env.reduce((a, b) => a + b, 0) / env.length;
    let bestF = 0;
    let best = -1;
    for (let f = 0.05; f <= 0.25; f += 0.005) {
      let re = 0;
      let im = 0;
      env.forEach((e, k) => {
        re += (e - mean) * Math.cos(2 * Math.PI * f * k * 0.5);
        im += (e - mean) * Math.sin(2 * Math.PI * f * k * 0.5);
      });
      const m = Math.hypot(re, im);
      if (m > best) {
        best = m;
        bestF = f;
      }
    }
    expect(bestF).toBeGreaterThan(0.08);
    expect(bestF).toBeLessThan(0.12);
    expect(slope(spectrum(x))).toBeLessThan(-4);
  });
  it('tailored noise has a deep notch at the matched pitch and is flat an octave and more away', () => {
    const s = spectrum(render('tailored', 8, 4000));
    const at = band(s, 3900, 4100);
    expect(band(s, 1000, 1500) - at).toBeGreaterThan(20);
    expect(band(s, 12000, 16000) - at).toBeGreaterThan(20);
    expect(Math.abs(band(s, 500, 1000) - band(s, 14000, 18000))).toBeLessThan(2);
  });
  it('the tone is a sine at the pitch', () => {
    const s = spectrum(render('tone', 2, 1000));
    const bin = SR / FFT;
    let peak = 0;
    for (let i = 1; i < s.length; i++) if ((s[i] ?? -999) > (s[peak] ?? -999)) peak = i;
    expect(Math.abs(peak * bin - 1000)).toBeLessThan(bin);
  });
  it.each(['white', 'pink', 'brown', 'rain', 'ocean', 'tailored', 'tone'] as const)(
    '%s is normalised to -20 dBFS RMS',
    (kind) => {
      const x = render(kind, kind === 'ocean' ? 30 : 8);
      expect(rmsDb(x, SR * 2)).toBeCloseTo(CALM_RMS_DBFS, kind === 'ocean' ? -0.3 : 0);
    },
  );
});

describe('Calm Sounds volume cap', () => {
  it('is Lc - 10 dB, or -24 dBFS without calibration', () => {
    expect(calmCapDbfs(-20)).toBe(-30);
    expect(calmCapDbfs(null)).toBe(-24);
  });
  it('holds with a maliciously set slider value', () => {
    const cap = -30;
    const top = 10 ** ((cap - CALM_RMS_DBFS) / 20);
    for (const v of [1, 2, 1e9, Infinity, -1, Number.NaN])
      expect(calmGain(v, cap)).toBeLessThanOrEqual(top + 1e-12);
    expect(calmGain(Number.NaN, cap)).toBe(0);
    expect(calmGain(0.5, cap)).toBeCloseTo(10 ** ((cap - 20 - CALM_RMS_DBFS) / 20), 9);
  });
});

describe('pitch match steps', () => {
  it('moves in third-octave steps within 250 Hz to 12.5 kHz', () => {
    expect(pitchStep(6000, 3)).toBeCloseTo(12000, 6);
    expect(pitchStep(6000, -1)).toBeCloseTo(6000 / 2 ** (1 / 3), 6);
    expect(pitchStep(12000, 3)).toBe(12500);
    expect(pitchStep(300, -3)).toBe(250);
  });
});
