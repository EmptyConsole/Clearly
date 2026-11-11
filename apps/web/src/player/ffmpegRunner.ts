// One ffmpeg.wasm session (M11): @ffmpeg/ffmpeg runs Clearly's LGPL core inside its own dedicated
// module worker, loaded by dynamic import from blob URLs of the cached files. Input files are
// mounted with WORKERFS, which reads a File in place instead of copying it into ffmpeg's memory
// filesystem (recorded in docs/DECISIONS.txt). terminate() stops everything and frees the worker,
// including any half-written output in its memory filesystem.

import type { FFFSType } from '@ffmpeg/ffmpeg';
import { cachedFfmpegUrls } from '../heavy/ffmpeg.ts';

export class FfmpegUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FfmpegUnavailableError';
  }
}

export interface FfmpegSession {
  /** Mounts files read-only at `dir` (for example /in) under the given names. */
  mount(dir: string, files: readonly { name: string; blob: Blob }[]): Promise<void>;
  /** Runs ffprobe and returns what it wrote with -o. */
  probe(args: readonly string[]): Promise<string>;
  /** Runs ffmpeg; resolves with its exit code. */
  exec(args: readonly string[]): Promise<number>;
  readFile(path: string): Promise<Uint8Array>;
  deleteFile(path: string): Promise<void>;
  onProgress(cb: (fraction: number) => void): void;
  /** The last lines ffmpeg logged (for error reports and tests). */
  log(): readonly string[];
  terminate(): void;
}

const LOG_LINES = 200;

export async function openFfmpeg(): Promise<FfmpegSession> {
  const urls = await cachedFfmpegUrls();
  if (!urls) throw new FfmpegUnavailableError('the video tool has not been downloaded');
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const ff = new FFmpeg();
  const lines: string[] = [];
  let progress: ((f: number) => void) | null = null;
  ff.on('log', ({ message }) => {
    lines.push(message);
    if (lines.length > LOG_LINES) lines.shift();
  });
  ff.on('progress', ({ progress: p }) => {
    if (Number.isFinite(p)) progress?.(Math.max(0, Math.min(1, p)));
  });
  try {
    await ff.load({ coreURL: urls.coreURL, wasmURL: urls.wasmURL });
  } catch (e) {
    ff.terminate();
    urls.revoke();
    throw new FfmpegUnavailableError(e instanceof Error ? e.message : String(e));
  }
  // The worker has compiled the module; the blob URLs are no longer needed.
  urls.revoke();
  const dirs = new Set<string>();

  return {
    async mount(dir, files) {
      if (!dirs.has(dir)) {
        await ff.createDir(dir);
        dirs.add(dir);
      }
      // FFFSType is a TypeScript enum the package declares but does not export at runtime, so its
      // string value is passed.
      await ff.mount(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-assignment -- see above
        'WORKERFS' as FFFSType,
        { blobs: files.map((f) => ({ name: f.name, data: f.blob })) },
        dir,
      );
    },
    async probe(args) {
      const out = '/probe.json';
      await ff.ffprobe([...args, '-o', out]);
      const text = await ff.readFile(out, 'utf8');
      await ff.deleteFile(out).catch(() => undefined);
      return typeof text === 'string' ? text : new TextDecoder().decode(text);
    },
    exec: (args) => ff.exec([...args]),
    async readFile(path) {
      const data = await ff.readFile(path);
      return typeof data === 'string' ? new TextEncoder().encode(data) : data;
    },
    async deleteFile(path) {
      await ff.deleteFile(path);
    },
    onProgress(cb) {
      progress = cb;
    },
    log: () => lines,
    terminate() {
      ff.terminate();
    },
  };
}
