// Segmented offline renderer. The same buildProcessingGraph as live playback runs in one
// OfflineAudioContext per segment, so memory stays bounded for any length.
//
// For segment k covering output frames [a, b):
//   - it renders output [a - preRoll, b + X) (no pre-roll for the first segment, which starts
//     from silence exactly as a single pass does); its input runs latencySamples further, to
//     b + X + latencySamples, because the limiters and compressors look ahead: output at frame f
//     depends on input up to f + latencySamples;
//   - the pre-roll warms up every filter, compressor and limiter, then is discarded, and the output
//     is read latencySamples later than the input, so output frame f lines up with input frame f;
//   - X = 10 ms past b is kept as the "tail"; the next segment's first X frames are crossfaded with
//     it. Both renders contain the same audio there (same graph, warmed-up state), so the fade is
//     amplitude-complementary (raised cosine, weights sin^2 and cos^2 that sum to 1). A true
//     equal-power fade (sin and cos) would swell correlated audio by up to 3 dB mid-fade; see
//     docs/DECISIONS.txt.
// Output goes to the sink in one-second blocks as each segment finishes; nothing accumulates.

import type { Profile } from '@clearly/core';
import {
  ENGINE_SAMPLE_RATE_HZ,
  RENDER_CROSSFADE_MS,
  RENDER_PREROLL_S_DEFAULT,
  RENDER_PROGRESS_INTERVAL_S,
  RENDER_SEGMENT_S_DEFAULT,
  RENDER_SINK_BLOCK_FRAMES,
} from '../constants.ts';
import { buildProcessingGraph, getLatencyBudget } from '../graph/buildProcessingGraph.ts';
import type { GraphSettings, ProcessingMode } from '../graph/params.ts';
import {
  InputWindow,
  SampleRateError,
  type ChunkedSourceReader,
  type EncoderSink,
  type StereoBlock,
} from './source.ts';

export interface RenderProgress {
  /** 0 to 1 over the whole render. */
  readonly fraction: number;
  readonly segment: number;
  readonly segments: number;
}

export interface RenderOptions<T> {
  readonly sink: EncoderSink<T>;
  readonly segmentSeconds?: number;
  readonly preRollSeconds?: number;
  readonly mode?: ProcessingMode;
  readonly onProgress?: (p: RenderProgress) => void;
  readonly signal?: AbortSignal;
  readonly workletModuleUrl?: string;
  /** The compiled RNNoise module, so exports include Background cleanup (M06). */
  readonly cleanupModule?: WebAssembly.Module;
}

export interface RenderResult<T> {
  readonly result: T;
  readonly frames: number;
  readonly segments: number;
  readonly latencySamples: number;
}

/** Meters are not needed during export; report rarely to keep message traffic low. */
const OFFLINE_REPORT_INTERVAL_MS = 1000;

function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error
    ? reason
    : new DOMException('The render was cancelled.', 'AbortError');
}

export async function renderOffline<T>(
  source: ChunkedSourceReader,
  profile: Profile | null,
  settings: GraphSettings,
  options: RenderOptions<T>,
): Promise<RenderResult<T>> {
  if (source.sampleRate !== ENGINE_SAMPLE_RATE_HZ) throw new SampleRateError(source.sampleRate);
  const sr = ENGINE_SAMPLE_RATE_HZ;
  const D = source.durationFrames;
  const S = Math.max(1, Math.round((options.segmentSeconds ?? RENDER_SEGMENT_S_DEFAULT) * sr));
  const P = Math.round((options.preRollSeconds ?? RENDER_PREROLL_S_DEFAULT) * sr);
  const X = Math.round((RENDER_CROSSFADE_MS * sr) / 1000);
  const segments = Math.max(1, Math.ceil(D / S));
  const { sink, signal } = options;
  const window = new InputWindow(source);
  let tail: StereoBlock | null = null;
  const { total: latencySamples } = await getLatencyBudget(sr);

  const emit = async (L: Float32Array, R: Float32Array, from: number, to: number) => {
    for (let s = from; s < to; s += RENDER_SINK_BLOCK_FRAMES) {
      const e = Math.min(to, s + RENDER_SINK_BLOCK_FRAMES);
      await sink.write([{ left: L.slice(s, e), right: R.slice(s, e) }]);
    }
  };

  try {
    for (let k = 0; k < segments; k++) {
      if (signal?.aborted) throw abortError(signal);
      const a = k * S;
      const b = Math.min(D, a + S);
      const pre = k === 0 ? 0 : Math.min(P, a);
      const tailX = Math.min(X, D - b);
      const inStart = a - pre;
      const outLen = b + tailX - inStart;
      await window.ensure(b + tailX + latencySamples);
      window.dropBefore(inStart);

      const renderFrames = outLen + latencySamples;
      const ctx = new OfflineAudioContext(2, renderFrames, sr);
      const src = ctx.createBufferSource();
      const graph = await buildProcessingGraph(ctx, profile, settings, {
        input: src,
        ...(options.mode ? { mode: options.mode } : {}),
        ...(options.workletModuleUrl ? { workletModuleUrl: options.workletModuleUrl } : {}),
        ...(options.cleanupModule ? { cleanupModule: options.cleanupModule } : {}),
        reportIntervalMs: OFFLINE_REPORT_INTERVAL_MS,
      });
      if (graph.latencySamples !== latencySamples) throw new Error('graph latency changed');
      const input = ctx.createBuffer(2, renderFrames, sr);
      // Input [inStart, inStart + renderFrames): up to b + X + latency, zeros past the end.
      window.copy(inStart, renderFrames, input.getChannelData(0), input.getChannelData(1));
      // Keep only what the next segment re-reads (its pre-roll), so the source data is not held
      // twice while this segment renders.
      window.dropBefore(Math.max(0, b - P));
      src.buffer = input;
      src.start(0);

      // Progress and cancellation inside the segment.
      const totalS = renderFrames / sr;
      for (let t = RENDER_PROGRESS_INTERVAL_S; t < totalS - 0.1; t += RENDER_PROGRESS_INTERVAL_S) {
        const at = t;
        void ctx.suspend(at).then(() => {
          // On cancel the context is left suspended and dropped; the race below rejects.
          if (signal?.aborted) return;
          options.onProgress?.({ fraction: (k + at / totalS) / segments, segment: k, segments });
          return ctx.resume();
        });
      }
      const renderPromise = ctx.startRendering();
      const rendered = await (signal
        ? Promise.race([
            renderPromise,
            new Promise<never>((_, reject) => {
              const onAbort = () => {
                reject(abortError(signal));
              };
              if (signal.aborted) onAbort();
              else signal.addEventListener('abort', onAbort, { once: true });
              void renderPromise.finally(() => {
                signal.removeEventListener('abort', onAbort);
              });
            }),
          ])
        : renderPromise);
      graph.dispose();

      const L = rendered.getChannelData(0);
      const R = rendered.getChannelData(1);
      const off = pre + latencySamples; // rendered index of output frame a
      const segLen = b - a;
      // Crossfade the head with the previous segment's tail.
      if (tail) {
        const n = tail.left.length;
        for (let i = 0; i < n; i++) {
          const w = Math.sin((Math.PI / 2) * ((i + 0.5) / n)) ** 2;
          const j = off + i;
          L[j] = (tail.left[i] ?? 0) * (1 - w) + (L[j] ?? 0) * w;
          R[j] = (tail.right[i] ?? 0) * (1 - w) + (R[j] ?? 0) * w;
        }
      }
      tail =
        tailX > 0
          ? {
              left: L.slice(off + segLen, off + segLen + tailX),
              right: R.slice(off + segLen, off + segLen + tailX),
            }
          : null;
      await emit(L, R, off, off + segLen);
      options.onProgress?.({ fraction: (k + 1) / segments, segment: k, segments });
    }
    const result = await sink.finish();
    return { result, frames: D, segments, latencySamples };
  } catch (e) {
    sink.abort(e);
    throw e;
  }
}
