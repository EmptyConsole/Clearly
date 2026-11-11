// The caption transcriber (M07): Whisper through @huggingface/transformers in a dedicated worker.
// Only local files: remote models are off, models load from /heavy/models/ on this origin, the
// ONNX Runtime WebAssembly loads from /heavy/ort/, and the cache is Clearly's own verified heavy
// cache. WebGPU is used only after a test run of the real model succeeds; otherwise WebAssembly
// (threads only when cross-origin isolated).

/// <reference lib="webworker" />
import type { Word } from '@clearly/core';
import { HEAVY_CACHE, heavyCacheKey } from '../heavy/heavy.ts';
import { MODEL_ROOT, ORT_PATHS } from './assets.ts';
import type { FromTranscriber, ToTranscriber } from './protocol.ts';

declare const self: DedicatedWorkerGlobalScope;

type Asr = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<{ text: string; chunks?: { text: string; timestamp: [number, number | null] }[] }>;

let asr: Asr | null = null;

const send = (m: FromTranscriber) => {
  self.postMessage(m);
};

/** Maps a transformers.js cache key (a Hugging Face URL or a local path) to our /heavy/ URL. */
function toLocal(key: string | Request): string {
  const url = typeof key === 'string' ? key : key.url;
  const m = /huggingface\.co\/([^/]+\/[^/]+)\/resolve\/[^/]+\/(.+)$/.exec(url);
  if (m) return `${MODEL_ROOT}${m[1] ?? ''}/${m[2] ?? ''}`;
  return url;
}

async function load(repo: string, preferGpu: boolean): Promise<void> {
  const { env, pipeline } = await import('@huggingface/transformers');
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = MODEL_ROOT;
  env.useBrowserCache = false;
  env.useCustomCache = true;
  env.customCache = {
    match: async (key: string | Request) =>
      (await caches.open(HEAVY_CACHE)).match(heavyCacheKey(toLocal(key))),
    // Files are verified and cached by Clearly's own download step; nothing to add here.
    put: () => Promise.resolve(),
  };
  const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number } };
  const threads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  if (onnx.wasm) {
    onnx.wasm.wasmPaths = { ...ORT_PATHS };
    onnx.wasm.numThreads = threads;
  }
  const model = `onnx-community/${repo}`;
  const make = (device: 'webgpu' | 'wasm') =>
    pipeline('automatic-speech-recognition', model, {
      device,
      dtype: 'q8',
    }) as unknown as Promise<Asr>;
  // WebGPU may be missing even where the DOM types declare it.
  const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (preferGpu && gpu !== undefined && (await gpu.requestAdapter().catch(() => null))) {
    try {
      const p = await make('webgpu');
      // The feature test: actually run the model once on a second of near silence.
      await p(
        new Float32Array(16000).map(() => (Math.random() - 0.5) * 1e-3),
        {},
      );
      asr = p;
      send({ type: 'ready', device: 'webgpu', threads });
      return;
    } catch {
      // Fall back to WebAssembly below.
    }
  }
  asr = await make('wasm');
  send({ type: 'ready', device: 'wasm', threads });
}

async function transcribe(id: number, start: number, samples: Float32Array): Promise<void> {
  if (!asr) throw new Error('the model is not loaded');
  const out = await asr(samples, { return_timestamps: 'word' });
  const words: Word[] = [];
  for (const c of out.chunks ?? []) {
    const [s, e] = c.timestamp;
    const text = c.text.trim();
    if (!text) continue;
    words.push({ text, start: start + s, end: start + (e ?? s + 0.3) });
  }
  send({ type: 'words', id, words });
}

self.onmessage = (e: MessageEvent<ToTranscriber>) => {
  const m = e.data;
  const run = m.type === 'load' ? load(m.repo, m.preferGpu) : transcribe(m.id, m.start, m.samples);
  run.catch((err: unknown) => {
    send({
      type: 'error',
      ...(m.type === 'transcribe' ? { id: m.id } : {}),
      message: err instanceof Error ? err.message : String(err),
    });
  });
};
