// "Save enhanced copy" for file sources: chunked decoding (packages/audio openFileReader), the M02
// segmented renderer (120 s segments, 5 s pre-roll) and the WAV or MP3 encoder worker.

import type { ChunkedSourceReader, GraphSettings, Mp3BitrateKbps } from '@clearly/audio';
import type { Profile } from '@clearly/core';
import { cachedRnnoiseModule } from '../heavy/rnnoise.ts';

export type ExportFormat = 'wav' | 'mp3';
export const DESKTOP_MAX_SECONDS = 3 * 3600;
export const PHONE_MAX_SECONDS = 30 * 60;
export const BLOB_LIMIT_BYTES = 1024 ** 3;
export const BENCHMARK_SECONDS = 10;

/** Phones, by capability: a coarse primary pointer with no fine pointer, or little memory. */
export function isPhoneLike(): boolean {
  const coarseOnly =
    window.matchMedia('(pointer: coarse)').matches &&
    !window.matchMedia('(any-pointer: fine)').matches;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return coarseOnly || (mem !== undefined && mem <= 2);
}

export function exportMaxSeconds(): number {
  return isPhoneLike() ? PHONE_MAX_SECONDS : DESKTOP_MAX_SECONDS;
}

export function estimatedBytes(
  format: ExportFormat,
  seconds: number,
  kbps: Mp3BitrateKbps,
): number {
  return format === 'wav'
    ? 44 + Math.ceil(seconds * 48000) * 4
    : Math.ceil((seconds * kbps * 1000) / 8);
}

export function outputName(fileName: string, format: ExportFormat): string {
  const base = fileName.replace(/\.[^.]+$/, '');
  return `${base} (Clearly).${format}`;
}

/** The first `frames` of a reader. */
export function truncate(reader: ChunkedSourceReader, frames: number): ChunkedSourceReader {
  const limit = Math.min(frames, reader.durationFrames);
  return {
    sampleRate: reader.sampleRate,
    durationFrames: limit,
    async *[Symbol.asyncIterator]() {
      let done = 0;
      for await (const b of reader) {
        const take = Math.min(b.left.length, limit - done);
        if (take <= 0) break;
        done += take;
        yield take === b.left.length
          ? b
          : { left: b.left.slice(0, take), right: b.right.slice(0, take) };
        if (done >= limit) break;
      }
    },
  };
}

const discardSink = {
  write: (): Promise<void> => Promise.resolve(),
  finish: () => Promise.resolve(null),
  abort: () => undefined,
};

/** Seconds the full export will take, from a short benchmark render of the start of the file. */
export async function estimateSeconds(
  file: Blob,
  profile: Profile | null,
  settings: GraphSettings,
  durationSeconds: number,
): Promise<number> {
  const { openFileReader, renderOffline } = await import('@clearly/audio');
  const opened = await openFileReader(file);
  const bench = Math.min(BENCHMARK_SECONDS, durationSeconds);
  const t0 = performance.now();
  await renderOffline(truncate(opened.reader, Math.round(bench * 48000)), profile, settings, {
    sink: discardSink,
  });
  const elapsed = (performance.now() - t0) / 1000;
  // Encoding runs alongside rendering in its own worker; add a margin for it and for segment joins.
  return Math.max(1, (elapsed / Math.max(bench, 0.5)) * durationSeconds * 1.3);
}

export interface ExportRun {
  readonly file: Blob;
  readonly format: ExportFormat;
  readonly bitrateKbps: Mp3BitrateKbps;
  readonly profile: Profile | null;
  readonly settings: GraphSettings;
  readonly signal: AbortSignal;
  readonly onProgress: (fraction: number) => void;
}

export async function runExport(r: ExportRun): Promise<Blob> {
  const { openFileReader, renderOffline, createWavSink, createMp3Sink } =
    await import('@clearly/audio');
  const cleanupModule = r.settings.cleanupStrength > 0 ? await cachedRnnoiseModule() : null;
  const opened = await openFileReader(r.file);
  const sink =
    r.format === 'wav'
      ? createWavSink({ expectedFrames: opened.reader.durationFrames })
      : createMp3Sink({ bitrateKbps: r.bitrateKbps });
  const result = await renderOffline(opened.reader, r.profile, r.settings, {
    sink,
    signal: r.signal,
    ...(cleanupModule ? { cleanupModule } : {}),
    onProgress: (p) => {
      r.onProgress(p.fraction);
    },
  });
  return result.result;
}

interface SavePicker {
  showSaveFilePicker?: (o: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<
      WritableStream & { write: (b: Blob) => Promise<void>; close: () => Promise<void> }
    >;
  }>;
}

/** True where the File System Access save picker exists (it streams the file to disk). */
export function canPickSaveLocation(): boolean {
  return typeof (window as unknown as SavePicker).showSaveFilePicker === 'function';
}

const PICKER_TYPES: Record<string, { mime: string; ext: string }> = {
  wav: { mime: 'audio/wav', ext: '.wav' },
  mp3: { mime: 'audio/mpeg', ext: '.mp3' },
  mp4: { mime: 'video/mp4', ext: '.mp4' },
  mkv: { mime: 'video/x-matroska', ext: '.mkv' },
};

/**
 * Writes the result to a file the person picks, streamed to disk by the browser. Returns false
 * when they cancel the picker.
 */
export async function saveWithPicker(
  blob: Blob,
  name: string,
  format: ExportFormat | 'mp4' | 'mkv',
): Promise<boolean> {
  const w = window as unknown as SavePicker;
  if (!w.showSaveFilePicker) return false;
  const type = PICKER_TYPES[format] ?? { mime: blob.type, ext: '' };
  try {
    const handle = await w.showSaveFilePicker({
      suggestedName: name,
      types: [{ description: format.toUpperCase(), accept: { [type.mime]: [type.ext] } }],
    });
    const out = await handle.createWritable();
    await out.write(blob);
    await out.close();
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return false;
    throw e;
  }
}
