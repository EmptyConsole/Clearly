// Caption model files: everything listed in heavy-manifest.json for a model, plus the ONNX Runtime
// WebAssembly. Sizes shown to the person are read from the manifest, never hard-coded.

import manifest from '../../../../heavy-manifest.json';
import { download, HEAVY_CACHE, heavyCacheKey, isCached, type HeavyInfo } from '../heavy/heavy.ts';

export type CaptionModel = 'standard' | 'accurate';
export const CAPTION_MODELS: Readonly<Record<CaptionModel, string>> = {
  standard: 'whisper-tiny.en_timestamped',
  accurate: 'whisper-base.en_timestamped',
};
export const MODEL_ROOT = '/heavy/models/';
export const ORT_PATHS = {
  mjs: '/heavy/ort/ort-wasm-simd-threaded.asyncify.mjs',
  wasm: '/heavy/ort/ort-wasm-simd-threaded.asyncify.wasm',
} as const;

export function modelFiles(model: CaptionModel): HeavyInfo[] {
  const repo = CAPTION_MODELS[model];
  return manifest.assets
    .filter((a) => a.name.startsWith(`${repo}:`) || a.name === 'ort-mjs' || a.name === 'ort-wasm')
    .map((a) => ({
      name: a.name,
      url: `/heavy/${a.destination}`,
      bytes: a.bytes,
      sha256: a.sha256,
    }));
}

export function modelBytes(model: CaptionModel): number {
  return modelFiles(model).reduce((n, f) => n + f.bytes, 0);
}

export async function isModelDownloaded(model: CaptionModel): Promise<boolean> {
  const checks = await Promise.all(modelFiles(model).map((f) => isCached(f)));
  return checks.every(Boolean);
}

/** Downloads every missing file (verified, cached). Progress is over the model's total bytes. */
export async function downloadModel(
  model: CaptionModel,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const files = modelFiles(model);
  const total = files.reduce((n, f) => n + f.bytes, 0);
  let done = 0;
  for (const f of files) {
    if (await isCached(f)) {
      done += f.bytes;
      onProgress(done / total);
      continue;
    }
    await download(
      f,
      (p) => {
        onProgress((done + p * f.bytes) / total);
      },
      signal,
    );
    done += f.bytes;
  }
  onProgress(1);
}

/** "Remove downloaded captions files" (Settings). */
export async function removeCaptionFiles(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(HEAVY_CACHE);
  for (const m of Object.keys(CAPTION_MODELS) as CaptionModel[]) {
    for (const f of modelFiles(m)) await cache.delete(heavyCacheKey(f.url));
  }
}
