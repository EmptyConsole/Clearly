// Latency measurement and the exact-delay helper.
//
// DynamicsCompressorNode has implementation-defined lookahead. Chromium 158 delays by 288 samples
// at 48 kHz (6 ms), measured 2026-11-09 as a pure delay (residual -151 dB). Rather than hard-code
// one browser's number, buildProcessingGraph measures it once per sample rate with a short
// OfflineAudioContext render, so the dry path matches on any engine.

const cache = new Map<number, Promise<number>>();

export function measureCompressorLatency(sampleRate: number): Promise<number> {
  let p = cache.get(sampleRate);
  if (!p) {
    p = measure(sampleRate);
    cache.set(sampleRate, p);
    p.catch(() => cache.delete(sampleRate));
  }
  return p;
}

async function measure(sampleRate: number): Promise<number> {
  const frames = 4096;
  const at = 256;
  const ctx = new OfflineAudioContext(1, frames, sampleRate);
  const buf = ctx.createBuffer(1, frames, sampleRate);
  buf.getChannelData(0)[at] = 0.01;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = 0;
  comp.ratio.value = 1;
  comp.knee.value = 0;
  src.connect(comp).connect(ctx.destination);
  src.start();
  const out = (await ctx.startRendering()).getChannelData(0);
  let best = 0;
  let bestAbs = 0;
  for (let i = 0; i < out.length; i++) {
    const a = Math.abs(out[i] ?? 0);
    if (a > bestAbs) {
      bestAbs = a;
      best = i;
    }
  }
  if (bestAbs === 0) throw new Error('could not measure the compressor latency');
  return best - at;
}

/**
 * delayTime for an exact integer delay. AudioParam values are float32, and k / sampleRate is
 * rarely exact, so a value just below k samples would make the DelayNode interpolate between two
 * samples. Use the smallest float32 at or above k / sampleRate.
 */
export function exactDelaySeconds(samples: number, sampleRate: number): number {
  const exact = samples / sampleRate;
  let f = Math.fround(exact);
  if (f < exact) {
    const buf = new Float32Array([f]);
    const bits = new Uint32Array(buf.buffer);
    bits[0] = (bits[0] ?? 0) + 1;
    f = buf[0] ?? exact;
  }
  return f;
}

export function createExactDelay(ctx: BaseAudioContext, samples: number): DelayNode {
  const seconds = exactDelaySeconds(samples, ctx.sampleRate);
  const node = ctx.createDelay(Math.max(seconds * 2, 0.01));
  node.delayTime.value = seconds;
  return node;
}
