// Sound for the speech-in-noise check (M08). Diotic: one mono signal feeds both ears.
//   Noise: white noise through the LTASS biquad cascade (core ltass.ts), scaled so its RMS is
//   Lc - 15 dBFS (never above -12). The filtered noise's RMS is measured once with a short
//   offline render, so the level does not depend on filter maths.
//   Speech: digit recordings, trimmed and equalised to -20 dBFS RMS, played at noise + SNR.
// Everything ends in a Safety limiter (RULES.md).

import { DIN_GAP_MS, LTASS_FILTERS, clampSnr, dinNoiseDbfs, type Triplet } from '@clearly/core';

export const DIGITS_PATH = '/digits/';
const LEAD_S = 0.5;
const TAIL_S = 0.5;

function applyFilters(ctx: BaseAudioContext, input: AudioNode): AudioNode {
  let prev = input;
  for (const f of LTASS_FILTERS) {
    const n = ctx.createBiquadFilter();
    n.type = f.type;
    n.frequency.value = f.frequencyHz;
    n.gain.value = f.gainDb;
    n.Q.value = f.q;
    prev.connect(n);
    prev = n;
  }
  return prev;
}

function whiteNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const b = ctx.createBuffer(1, Math.round(seconds * ctx.sampleRate), ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < d.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    d[i] = (s / 2 ** 32) * 2 - 1;
  }
  return b;
}

/** The RMS of white noise after the LTASS filters, measured offline. */
async function filteredNoiseRms(sampleRate: number): Promise<number> {
  const ctx = new OfflineAudioContext(1, sampleRate * 2, sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = whiteNoise(ctx, 2);
  applyFilters(ctx, src).connect(ctx.destination);
  src.start();
  const out = (await ctx.startRendering()).getChannelData(0);
  let p = 0;
  for (let i = sampleRate / 2; i < out.length; i++) p += (out[i] ?? 0) ** 2;
  return Math.sqrt(p / (out.length - sampleRate / 2));
}

/** Loads digits 0 to 9, or null when the pack is not installed. */
export async function loadDigits(ctx: BaseAudioContext): Promise<AudioBuffer[] | null> {
  const { prepareDigit } = await import('@clearly/audio');
  const out: AudioBuffer[] = [];
  for (let d = 0; d <= 9; d++) {
    const res = await fetch(`${DIGITS_PATH}${d}.wav`).catch(() => null);
    // The app's single-page fallback answers unknown paths with the HTML page, so anything that
    // is not audio counts as "not installed".
    if (!res?.ok || !(res.headers.get('content-type') ?? '').startsWith('audio/')) return null;
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      return null;
    }
    const mono = new Float32Array(decoded.length);
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const ch = decoded.getChannelData(c);
      for (let i = 0; i < mono.length; i++)
        mono[i] = (mono[i] ?? 0) + (ch[i] ?? 0) / decoded.numberOfChannels;
    }
    const prepared = prepareDigit(mono, ctx.sampleRate);
    const b = ctx.createBuffer(1, prepared.length, ctx.sampleRate);
    b.copyToChannel(prepared as Float32Array<ArrayBuffer>, 0);
    out.push(b);
  }
  return out;
}

export class DinPlayer {
  private constructor(
    private readonly ctx: AudioContext,
    private readonly noiseGain: GainNode,
    private readonly speechBus: GainNode,
    private readonly noiseLinear: number,
    private readonly safety: AudioWorkletNode,
    private readonly noiseSrc: AudioBufferSourceNode,
    readonly noiseDbfs: number,
  ) {}

  static async create(ctx: AudioContext, lcDbfs: number): Promise<DinPlayer> {
    const { createSafetyLimiter } = await import('@clearly/audio');
    const safety = await createSafetyLimiter(ctx);
    const noiseDbfs = dinNoiseDbfs(lcDbfs);
    const rms = await filteredNoiseRms(ctx.sampleRate);
    const noiseLinear = 10 ** (noiseDbfs / 20) / rms;
    const src = ctx.createBufferSource();
    src.buffer = whiteNoise(ctx, 8);
    src.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    applyFilters(ctx, src).connect(noiseGain).connect(safety);
    const speechBus = ctx.createGain();
    speechBus.connect(safety);
    src.start();
    return new DinPlayer(ctx, noiseGain, speechBus, noiseLinear, safety, src, noiseDbfs);
  }

  /** Plays one triplet at the given SNR; resolves when the noise has faded out. */
  async play(digits: readonly AudioBuffer[], triplet: Triplet, snrDb: number): Promise<number> {
    const { DIGIT_RMS_DBFS } = await import('@clearly/audio');
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.1;
    const g = this.noiseGain.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(this.noiseLinear, t0 + 0.05);
    const speechGain = 10 ** ((this.noiseDbfs + clampSnr(snrDb) - DIGIT_RMS_DBFS) / 20);
    let t = t0 + LEAD_S;
    for (const d of triplet) {
      const buf = digits[d];
      if (!buf) continue;
      const s = ctx.createBufferSource();
      s.buffer = buf;
      const sg = ctx.createGain();
      sg.gain.value = speechGain;
      s.connect(sg).connect(this.speechBus);
      s.start(t);
      t += buf.duration + DIN_GAP_MS / 1000;
    }
    const end = t - DIN_GAP_MS / 1000 + TAIL_S;
    g.setValueAtTime(this.noiseLinear, end);
    g.linearRampToValueAtTime(0, end + 0.05);
    const seconds = end + 0.05 - t0;
    await new Promise((r) => setTimeout(r, (end + 0.1 - ctx.currentTime) * 1000));
    return seconds;
  }

  dispose(): void {
    this.noiseSrc.stop();
    this.noiseGain.disconnect();
    this.speechBus.disconnect();
    this.safety.port.postMessage({ type: 'stop' });
    this.safety.disconnect();
  }
}
