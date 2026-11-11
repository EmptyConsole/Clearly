// "Video with enhanced audio" (M11). Steps:
//   1. Probe the file with ffprobe and decide the container from the video codec (videoMux.ts).
//   2. Render the enhanced audio with the M02 segmented renderer into a temporary WAV in the Origin
//      Private File System where available (otherwise a Blob the browser may keep on disk).
//   3. Mux with ffmpeg: video copied untouched, audio to AAC 192 kbps, subtitles and metadata kept.
// Both inputs are mounted with WORKERFS, so neither is copied into ffmpeg's memory. Cancel
// terminates the ffmpeg worker and the encoder worker and deletes the temporary WAV.

import { OPFS_TEMP_DIR, type GraphSettings } from '@clearly/audio';
import type { Profile } from '@clearly/core';
import { cachedRnnoiseModule } from '../heavy/rnnoise.ts';
import { testHooks } from '../test/hooks.ts';
import { openFfmpeg, type FfmpegSession } from './ffmpegRunner.ts';
import { muxArgs, parseProbe, planMux, videoOutputName, type MuxPlan } from './videoMux.ts';

/** WebAssembly memory limits: video muxing is offered for files up to this size. */
export const VIDEO_MAX_BYTES = 1024 ** 3;
/**
 * Muxing speed used for the time estimate, in input bytes per second (stream copy plus AAC
 * encoding, measured on the development machine; see docs/perf.txt).
 */
export const MUX_BYTES_PER_SECOND = 80 * 1024 ** 2;

export type VideoBlocker = 'phone' | 'too-big' | null;

export function videoBlocker(file: Blob, phone: boolean): VideoBlocker {
  if (phone) return 'phone';
  if (file.size > (testHooks()?.videoMaxBytes ?? VIDEO_MAX_BYTES)) return 'too-big';
  return null;
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/');
}

/** The file name extension WORKERFS shows ffmpeg (it never looks at it to pick the container). */
function inputName(file: File): string {
  const ext = /\.([A-Za-z0-9]{1,5})$/.exec(file.name)?.[1] ?? 'bin';
  return `input.${ext.toLowerCase()}`;
}

export class VideoExportError extends Error {
  constructor(
    readonly reason: 'probe' | 'no-video' | 'mux' | 'unavailable',
    message: string,
    readonly log: readonly string[] = [],
  ) {
    super(message);
    this.name = 'VideoExportError';
  }
}

export interface VideoExportResult {
  readonly blob: Blob;
  readonly name: string;
  readonly plan: MuxPlan;
}

export interface VideoExportRun {
  readonly file: File;
  readonly profile: Profile | null;
  readonly settings: GraphSettings;
  readonly signal: AbortSignal;
  /** 0 to 1 over the whole job. */
  readonly onProgress: (fraction: number) => void;
  readonly onStep?: (step: 'audio' | 'video') => void;
  /** Estimated seconds for rendering and for muxing (to weight the progress bar). */
  readonly estimate?: { readonly render: number; readonly mux: number };
}

/**
 * True when OPFS has room for a temporary file of this size with a margin. Private windows have a
 * small quota; there the WAV goes to a Blob instead (which the browser may still keep on disk).
 */
export async function opfsHasRoom(bytes: number): Promise<boolean> {
  try {
    const est = await navigator.storage.estimate();
    if (est.quota === undefined) return false;
    return est.quota - (est.usage ?? 0) > bytes * 1.2 + 64 * 1024 * 1024;
  } catch {
    return false;
  }
}

function hasOpfs(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    'getDirectory' in navigator.storage
  );
}

/** Deletes a temporary export file (retrying while a worker still has it open). */
export async function removeTemp(name: string): Promise<void> {
  if (!hasOpfs()) return;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(OPFS_TEMP_DIR);
      await dir.removeEntry(name);
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') return;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

/** Removes every temporary export file (left behind by a closed tab, for example). */
export async function clearTemp(): Promise<void> {
  if (!hasOpfs()) return;
  try {
    await (await navigator.storage.getDirectory()).removeEntry(OPFS_TEMP_DIR, { recursive: true });
  } catch {
    // Missing, or a file still open in another tab's export.
  }
}

export async function runVideoExport(r: VideoExportRun): Promise<VideoExportResult> {
  const renderShare = r.estimate
    ? r.estimate.render / Math.max(1e-6, r.estimate.render + r.estimate.mux)
    : 0.8;
  const tempName = `audio-${Date.now().toString(36)}.wav`;
  // A function, so each check reads the live flag after an await.
  const aborted = (): boolean => r.signal.aborted;
  let ff: FfmpegSession | null = null;
  const stop = () => {
    ff?.terminate();
  };
  r.signal.addEventListener('abort', stop, { once: true });
  try {
    ff = await openFfmpeg();
    if (aborted()) throw abortError(r.signal);
    const input = inputName(r.file);
    await ff.mount('/in', [{ name: input, blob: r.file }]);

    let plan: MuxPlan;
    try {
      const json = await ff.probe([
        '-v',
        'error',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        `/in/${input}`,
      ]);
      plan = planMux(parseProbe(json));
    } catch (e) {
      if (aborted()) throw abortError(r.signal);
      if (e instanceof Error && e.name === 'NoVideoError')
        throw new VideoExportError('no-video', e.message);
      throw new VideoExportError('probe', e instanceof Error ? e.message : String(e), ff.log());
    }

    // 2. The enhanced audio, through the same renderer as the WAV export.
    r.onStep?.('audio');
    const { openFileReader, renderOffline, createWavSink } = await import('@clearly/audio');
    const cleanupModule = r.settings.cleanupStrength > 0 ? await cachedRnnoiseModule() : null;
    const opened = await openFileReader(r.file);
    const wavBytes = 44 + opened.reader.durationFrames * 4;
    const onDisk = await opfsHasRoom(wavBytes);
    const rendered = await renderOffline(opened.reader, r.profile, r.settings, {
      sink: createWavSink({
        expectedFrames: opened.reader.durationFrames,
        ...(onDisk ? { opfsName: tempName } : {}),
      }),
      signal: r.signal,
      ...(cleanupModule ? { cleanupModule } : {}),
      onProgress: (p) => {
        r.onProgress(p.fraction * renderShare);
      },
    });
    const wav = rendered.result;

    // 3. Mux.
    r.onStep?.('video');
    await ff.mount('/wav', [{ name: 'audio.wav', blob: wav }]);
    ff.onProgress((f) => {
      r.onProgress(renderShare + f * (1 - renderShare));
    });
    const out = `/out.${plan.container}`;
    const code = await ff.exec(muxArgs(plan, `/in/${input}`, '/wav/audio.wav', out));
    if (aborted()) throw abortError(r.signal);
    if (code !== 0) throw new VideoExportError('mux', `ffmpeg exited with ${code}`, ff.log());
    // Read the result once (moved to this thread without a copy), then free the worker and its
    // memory file system before keeping the result, so at most two copies exist at any time.
    const data = await ff.readFile(out);
    ff.terminate();
    ff = null;
    const type = plan.container === 'mp4' ? 'video/mp4' : 'video/x-matroska';
    const blob = await keepOutput(
      data,
      `${tempName.replace(/\.wav$/, '')}.${plan.container}`,
      type,
    );
    r.onProgress(1);
    return { blob, name: videoOutputName(r.file.name, plan.container), plan };
  } catch (e) {
    if (aborted()) throw abortError(r.signal);
    throw e;
  } finally {
    r.signal.removeEventListener('abort', stop);
    ff?.terminate();
    await removeTemp(tempName);
  }
}

/**
 * The finished video: written to OPFS where there is room (it then waits on disk until it is saved;
 * clearTemp removes it when the dialog closes), otherwise a Blob.
 */
async function keepOutput(data: Uint8Array, name: string, type: string): Promise<Blob> {
  if (await opfsHasRoom(data.length)) {
    try {
      const dir = await (
        await navigator.storage.getDirectory()
      ).getDirectoryHandle(OPFS_TEMP_DIR, { create: true });
      const handle = await dir.getFileHandle(name, { create: true });
      const out = await handle.createWritable();
      await out.write(data as Uint8Array<ArrayBuffer>);
      await out.close();
      const file = await handle.getFile();
      return new File([file], name, { type });
    } catch {
      // Fall through to memory.
    }
  }
  return new Blob([data as Uint8Array<ArrayBuffer>], { type });
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The export was cancelled', 'AbortError');
}
