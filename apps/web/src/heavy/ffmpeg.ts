// The ffmpeg.wasm core for video export (M11): Clearly's own LGPL single-thread build
// (scripts/ffmpeg-wasm/build.sh), two files served from /heavy/ffmpeg/. Downloaded only after a
// tap, verified, kept in the Cache API, and handed to @ffmpeg/ffmpeg's worker as blob URLs so the
// worker never fetches anything itself.

import { download, heavyInfo, isCached, readCached, type HeavyInfo } from './heavy.ts';

export function ffmpegParts(): readonly [HeavyInfo, HeavyInfo] {
  return [heavyInfo('ffmpeg-core-js'), heavyInfo('ffmpeg-core-wasm')];
}

/** Total download size in bytes. */
export function ffmpegBytes(): number {
  const [js, wasm] = ffmpegParts();
  return js.bytes + wasm.bytes;
}

export async function ffmpegCached(): Promise<boolean> {
  const [js, wasm] = ffmpegParts();
  return (await isCached(js)) && (await isCached(wasm));
}

export interface FfmpegCoreUrls {
  readonly coreURL: string;
  readonly wasmURL: string;
  readonly revoke: () => void;
}

function urlsFrom(js: ArrayBuffer, wasm: ArrayBuffer): FfmpegCoreUrls {
  const coreURL = URL.createObjectURL(new Blob([js], { type: 'text/javascript' }));
  const wasmURL = URL.createObjectURL(new Blob([wasm], { type: 'application/wasm' }));
  return {
    coreURL,
    wasmURL,
    revoke: () => {
      URL.revokeObjectURL(coreURL);
      URL.revokeObjectURL(wasmURL);
    },
  };
}

/** Blob URLs for the cached core, or null when it has not been downloaded. */
export async function cachedFfmpegUrls(): Promise<FfmpegCoreUrls | null> {
  const [jsInfo, wasmInfo] = ffmpegParts();
  const [js, wasm] = await Promise.all([readCached(jsInfo), readCached(wasmInfo)]);
  return js && wasm ? urlsFrom(js, wasm) : null;
}

/** Downloads both files with one progress value (0 to 1, by bytes), verifies and caches them. */
export async function downloadFfmpeg(
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const [js, wasm] = ffmpegParts();
  const total = js.bytes + wasm.bytes;
  await download(
    js,
    (f) => {
      onProgress((f * js.bytes) / total);
    },
    signal,
  );
  await download(
    wasm,
    (f) => {
      onProgress((js.bytes + f * wasm.bytes) / total);
    },
    signal,
  );
}
