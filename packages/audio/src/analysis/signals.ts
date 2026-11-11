// Deterministic test signals (pure). Used by the Node tests, the Playwright audio harness and the
// development tools. Exported from '@clearly/audio/testing', never from the main entry.

import { XorShift32 } from '../dsp/wav.ts';

export type Stereo = [Float32Array, Float32Array];

/** Pink noise (Paul Kellet's refined filter on white noise), scaled to the requested RMS. */
export function pinkNoise(frames: number, rmsLevel: number, seed = 1): Float32Array {
  const rng = new XorShift32(seed);
  const out = new Float32Array(frames);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let energy = 0;
  for (let i = 0; i < frames; i++) {
    const w = rng.next() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const p = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    out[i] = p;
    energy += p * p;
  }
  const scale = rmsLevel / Math.sqrt(energy / Math.max(1, frames));
  for (let i = 0; i < frames; i++) out[i] = (out[i] ?? 0) * scale;
  return out;
}

export function whiteNoise(frames: number, amplitude: number, seed = 7): Float32Array {
  const rng = new XorShift32(seed);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) out[i] = (rng.next() * 2 - 1) * amplitude;
  return out;
}

export function sine(frames: number, sampleRate: number, hz: number, amplitude: number, phase = 0) {
  const out = new Float32Array(frames);
  const w = (2 * Math.PI * hz) / sampleRate;
  for (let i = 0; i < frames; i++) out[i] = amplitude * Math.sin(w * i + phase);
  return out;
}

/** Full-scale square wave (hostile: maximal sample peaks, Gibbs overshoot after filtering). */
export function square(frames: number, sampleRate: number, hz: number, amplitude = 1) {
  const out = new Float32Array(frames);
  const period = sampleRate / hz;
  for (let i = 0; i < frames; i++) out[i] = (i % period) / period < 0.5 ? amplitude : -amplitude;
  return out;
}

/** Logarithmic sweep, amplified then hard-clipped at +-1 (hostile). */
export function clippedSweep(
  frames: number,
  sampleRate: number,
  f0 = 20,
  f1 = 20000,
  overdriveDb = 12,
) {
  const out = new Float32Array(frames);
  const T = frames / sampleRate;
  const k = Math.log(f1 / f0);
  const g = 10 ** (overdriveDb / 20);
  for (let i = 0; i < frames; i++) {
    const t = i / sampleRate;
    const phase = ((2 * Math.PI * f0 * T) / k) * (Math.exp((t / T) * k) - 1);
    out[i] = Math.max(-1, Math.min(1, g * Math.sin(phase)));
  }
  return out;
}

/** Full-scale impulses, alternating sign, every `spacing` samples (hostile). */
export function impulses(frames: number, spacing: number) {
  const out = new Float32Array(frames);
  for (let i = spacing >> 1, s = 1; i < frames; i += spacing, s = -s) out[i] = s;
  return out;
}

/**
 * A programme-like signal: a quiet pink noise bed (-44 dBFS RMS, so after a high-frequency EQ
 * boost it does not swamp the detector), speech-band tones with syllable-rate amplitude
 * modulation, and low "thump" transients with 3 ms raised-cosine attacks (fast but continuous, so
 * they are not discontinuities). Peak level is roughly -6 dBFS.
 */
export function programme(frames: number, sampleRate: number, seed = 3): Stereo {
  const bedL = pinkNoise(frames, 0.006, seed);
  const bedR = pinkNoise(frames, 0.006, seed + 1);
  const L = new Float32Array(frames);
  const R = new Float32Array(frames);
  const tones = [
    { hz: 220, amp: 0.08, mod: 3.1 },
    { hz: 750, amp: 0.06, mod: 4.3 },
    { hz: 1800, amp: 0.05, mod: 5.2 },
    { hz: 3200, amp: 0.03, mod: 3.7 },
  ];
  const thumpEvery = Math.round(sampleRate * 0.9);
  const attack = Math.round(sampleRate * 0.003);
  const decay = sampleRate * 0.08;
  for (let i = 0; i < frames; i++) {
    const t = i / sampleRate;
    let speech = 0;
    for (const s of tones) {
      const env = 0.5 - 0.5 * Math.cos(2 * Math.PI * s.mod * t);
      speech += s.amp * env * Math.sin(2 * Math.PI * s.hz * t);
    }
    const k = i % thumpEvery;
    let thump = 0;
    if (k < sampleRate * 0.5) {
      const env =
        (k < attack ? 0.5 - 0.5 * Math.cos((Math.PI * k) / attack) : 1) * Math.exp(-k / decay);
      thump = 0.25 * env * Math.sin((2 * Math.PI * 70 * k) / sampleRate);
    }
    L[i] = (bedL[i] ?? 0) + speech + thump;
    R[i] = (bedR[i] ?? 0) + 0.8 * speech + thump;
  }
  return [L, R];
}
