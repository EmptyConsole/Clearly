// The RNNoise module for Background cleanup: SIMD build where WebAssembly SIMD validates, the
// plain build otherwise. Compiled once on the main thread; the graph sends the compiled module
// to the worklet.

import { download, heavyInfo, readCached, type HeavyInfo } from './heavy.ts';

/** A minimal module using one SIMD instruction (v128.const, i8x16.popcnt): validates only with SIMD. */
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15,
  253, 98, 11,
]);

export function rnnoiseInfo(): HeavyInfo {
  return heavyInfo(WebAssembly.validate(SIMD_PROBE) ? 'rnnoise-simd' : 'rnnoise');
}

let compiled: Promise<WebAssembly.Module> | null = null;

/** The compiled module if it is already cached (no download), or null. */
export async function cachedRnnoiseModule(): Promise<WebAssembly.Module | null> {
  if (compiled) return compiled;
  const bytes = await readCached(rnnoiseInfo());
  if (!bytes) return null;
  compiled = WebAssembly.compile(bytes);
  return compiled;
}

export function downloadRnnoiseModule(
  onProgress: (f: number) => void,
  signal?: AbortSignal,
): Promise<WebAssembly.Module> {
  compiled = download(rnnoiseInfo(), onProgress, signal).then((b) => WebAssembly.compile(b));
  compiled.catch(() => {
    compiled = null;
  });
  return compiled;
}
