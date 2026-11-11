// A self-generated, speech-like test clip for the "Hear the difference" demo before the licensed
// TTS demo clip exists. Formant synthesis: a band-limited glottal pulse train with falling
// intonation through three vowel formant resonators, consonant-like noise bursts with high-
// frequency energy, syllable envelopes, two alternating voices, and a quiet pink-noise bed.
// It is not words; it has the spectrum and rhythm of speech, which is what the EQ acts on.
// Made entirely by this code, so it carries no third-party licence (CC0, assets/demo/LICENSES.txt).

import { pinkNoise } from '../analysis/signals.ts';
import { XorShift32 } from '../dsp/wav.ts';

export interface SyntheticSpeechOptions {
  readonly sampleRate: number;
  readonly seconds: number;
  readonly seed?: number;
}

const VOWELS: readonly (readonly [number, number, number])[] = [
  [730, 1090, 2440],
  [270, 2290, 3010],
  [300, 870, 2240],
  [530, 1840, 2480],
  [570, 840, 2410],
  [440, 1020, 2240],
];

class Resonator {
  private y1 = 0;
  private y2 = 0;
  private a1 = 0;
  private a2 = 0;
  private g = 0;
  set(freq: number, bw: number, fs: number): void {
    const r = Math.exp((-Math.PI * bw) / fs);
    this.a1 = 2 * r * Math.cos((2 * Math.PI * freq) / fs);
    this.a2 = -r * r;
    this.g = 1 - r;
  }
  step(x: number): number {
    const y = this.g * x + this.a1 * this.y1 + this.a2 * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Returns stereo channels. Speech peaks at about -8 dBFS; the bed sits about 30 dB below. */
export function syntheticSpeech(o: SyntheticSpeechOptions): [Float32Array, Float32Array] {
  const fs = o.sampleRate;
  const n = Math.round(o.seconds * fs);
  const rng = new XorShift32(o.seed ?? 11);
  const speech = new Float32Array(n);
  const pan = new Float32Array(n);
  const res = [new Resonator(), new Resonator(), new Resonator()];
  const fric = new Resonator();
  let phase = 0;
  let t = Math.round(0.4 * fs);
  let voice = 0;
  while (t < n - fs * 0.5) {
    const syllables = 5 + Math.floor(rng.next() * 6);
    const f0Base = voice === 0 ? 115 : 205;
    const scale = voice === 0 ? 1 : 1.17;
    for (let s = 0; s < syllables && t < n - fs * 0.3; s++) {
      const vowel = VOWELS[Math.floor(rng.next() * VOWELS.length)] ?? VOWELS[0];
      const consonant = Math.round((0.03 + rng.next() * 0.05) * fs);
      const vowelLen = Math.round((0.12 + rng.next() * 0.12) * fs);
      const fricFreq = 3500 + rng.next() * 3000;
      fric.set(fricFreq, 1800, fs);
      for (let i = 0; i < consonant && t + i < n; i++) {
        const env = Math.sin((Math.PI * i) / consonant);
        speech[t + i] = (speech[t + i] ?? 0) + 0.9 * env * fric.step(rng.next() * 2 - 1);
        pan[t + i] = voice;
      }
      t += consonant;
      if (!vowel) continue;
      vowel.forEach((f, k) => {
        res[k]?.set(f * scale, 60 + 40 * k, fs);
      });
      const progress = s / Math.max(1, syllables - 1);
      const stress = rng.next() < 0.3 ? 1.12 : 1;
      for (let i = 0; i < vowelLen && t + i < n; i++) {
        const f0 =
          f0Base *
          (1.1 - 0.2 * progress) *
          stress *
          (1 + 0.03 * Math.sin((i / fs) * 2 * Math.PI * 5));
        phase += f0 / fs;
        if (phase >= 1) phase -= 1;
        // Band-limited-ish glottal pulse: a smoothed sawtooth.
        const src = 2 * phase - 1;
        const env = Math.min(1, i / (0.015 * fs), (vowelLen - i) / (0.03 * fs));
        let y = 0;
        res.forEach((r, k) => {
          y += r.step(src) * (k === 0 ? 1 : k === 1 ? 0.7 : 0.45);
        });
        speech[t + i] = (speech[t + i] ?? 0) + 0.5 * env * y;
        pan[t + i] = voice;
      }
      t += vowelLen + Math.round(rng.next() * 0.04 * fs);
    }
    t += Math.round((0.35 + rng.next() * 0.3) * fs);
    voice = 1 - voice;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(speech[i] ?? 0));
  const target = 10 ** (-8 / 20);
  const k = peak > 0 ? target / peak : 0;
  const bed = pinkNoise(n, 10 ** (-42 / 20), (o.seed ?? 11) + 1);
  const bedR = pinkNoise(n, 10 ** (-42 / 20), (o.seed ?? 11) + 2);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = (speech[i] ?? 0) * k;
    // The two voices sit slightly left and slightly right of centre.
    const p = pan[i] ?? 0;
    const gl = p === 0 ? 1 : 0.8;
    const gr = p === 0 ? 0.8 : 1;
    left[i] = s * gl + (bed[i] ?? 0);
    right[i] = s * gr + (bedR[i] ?? 0);
  }
  return [left, right];
}
