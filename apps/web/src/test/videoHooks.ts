// Test builds only (VITE_TEST_HOOKS=1): small generated video fixtures and raw ffmpeg runs, for
// the M11 Playwright tests. Fixtures are encoded here with WebCodecs and muxed with mediabunny, so
// nothing is committed and no native ffmpeg is needed.

import { downloadFfmpeg, ffmpegCached } from '../heavy/ffmpeg.ts';
import { testHooks } from './hooks.ts';
import { openFfmpeg as openCached } from '../player/ffmpegRunner.ts';
import { playerSettings } from '../player/settings.ts';
import { runVideoExport } from '../player/videoExport.ts';
import { useAppSettings } from '../store/appSettingsStore.ts';

/** Tests skip the consent step: download the core on first use. */
async function openFfmpeg() {
  if (!(await ffmpegCached())) await downloadFfmpeg(() => undefined);
  return openCached();
}

export type FixtureKind = 'h264-aac-mp4' | 'vp9-opus-webm' | 'vp8-opus-webm' | 'h264-opus-subs-mkv';

export interface VideoTestHooks {
  makeFixture(kind: FixtureKind, seconds: number): Promise<{ name: string; bytes: Uint8Array }>;
  /** Runs ffmpeg with the files mounted at /in; returns the exit code, log and an output file. */
  run(
    files: readonly { name: string; bytes: Uint8Array }[],
    args: readonly string[],
    output?: string,
  ): Promise<{ code: number; log: string[]; output: Uint8Array | null }>;
  probe(file: { name: string; bytes: Uint8Array }): Promise<string>;
  /** Names of the files in the temporary export folder. */
  tempFiles(): Promise<string[]>;
  /**
   * Memory test: a 720p H.264 + AAC MP4 of incompressible noise, looped with ffmpeg (stream copy)
   * to about `megabytes`, kept in OPFS (not in memory). Returns its size and duration.
   */
  makeLargeFixture(megabytes: number): Promise<{ bytes: number; seconds: number }>;
  /** Exports the large fixture through the real pipeline (default settings, no profile). */
  exportLarge(): Promise<{ bytes: number; container: string; seconds: number }>;
  removeLarge(): Promise<void>;
}

const LARGE_DIR = 'clearly-test';
const LARGE_NAME = 'large.mp4';
const NOISE_SECONDS = 10;
const NOISE_KBPS = 60_000;

declare global {
  interface Window {
    __clearlyVideo?: VideoTestHooks;
  }
}

const W = 320;
const H = 180;
const FPS = 25;
const RATE = 48000;

function tone(seconds: number): AudioBuffer {
  const n = seconds * RATE;
  const buf = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: RATE });
  let seed = 4321;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      d[i] =
        0.06 * rnd() +
        0.1 * Math.sin(2 * Math.PI * 300 * t) +
        0.1 * Math.sin(2 * Math.PI * 3000 * t);
    }
  }
  return buf;
}

async function makeFixture(kind: FixtureKind, seconds: number) {
  const mb = await import('mediabunny');
  // Not every Chromium has a WebCodecs AAC encoder (Linux builds, as in CI, do not). Then the
  // H.264 + AAC fixture is made with Opus in MKV, and its audio is converted to AAC by Clearly's own
  // ffmpeg (native AAC encoder), with the video copied.
  const aacViaFfmpeg =
    kind === 'h264-aac-mp4' &&
    (testHooks()?.forceFfmpegAac === true || !(await mb.canEncodeAudio('aac')));
  const target = new mb.BufferTarget();
  const format =
    kind === 'h264-aac-mp4' && !aacViaFfmpeg
      ? new mb.Mp4OutputFormat()
      : kind === 'vp9-opus-webm' || kind === 'vp8-opus-webm'
        ? new mb.WebMOutputFormat()
        : new mb.MkvOutputFormat();
  const output = new mb.Output({ format, target });
  const canvas = new OffscreenCanvas(W, H);
  const g = canvas.getContext('2d');
  if (!g) throw new Error('no 2d context');
  const video = new mb.CanvasSource(canvas, {
    codec: kind === 'vp9-opus-webm' ? 'vp9' : kind === 'vp8-opus-webm' ? 'vp8' : 'avc',
    quality: new mb.Quality({ bitrate: 400_000 }),
  });
  const audio = new mb.AudioBufferSource({
    codec: kind === 'h264-aac-mp4' && !aacViaFfmpeg ? 'aac' : 'opus',
    quality: new mb.Quality({ bitrate: 128_000 }),
  });
  output.addVideoTrack(video, { frameRate: FPS });
  output.addAudioTrack(audio, { languageCode: 'eng' });
  output.setMetadataTags({ title: 'Clearly fixture', comment: kind });
  await output.start();
  for (let f = 0; f < seconds * FPS; f++) {
    g.fillStyle = `hsl(${(f * 7) % 360} 60% 50%)`;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff';
    g.font = '32px sans-serif';
    g.fillText(String(f), 20, 100);
    await video.add(f / FPS, 1 / FPS);
  }
  await audio.add(tone(seconds));
  await output.finalize();
  const ext = kind === 'h264-aac-mp4' ? 'mp4' : kind === 'h264-opus-subs-mkv' ? 'mkv' : 'webm';
  if (!target.buffer) throw new Error('no output');
  const made = { name: `fixture.${ext}`, bytes: new Uint8Array(target.buffer) };
  if (aacViaFfmpeg) {
    const mkv = { name: 'fixture.mkv', bytes: made.bytes };
    const r = await runFfmpeg(
      [mkv],
      [
        '-i',
        '/in/fixture.mkv',
        '-map',
        '0',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-metadata',
        'title=Clearly fixture',
        '-metadata',
        `comment=${kind}`,
        '-f',
        'mp4',
        '/aac.mp4',
      ],
      '/aac.mp4',
    );
    if (r.code !== 0 || !r.output) throw new Error(`AAC conversion failed: ${r.log.join('\n')}`);
    return { name: 'fixture.mp4', bytes: r.output };
  }
  if (kind !== 'h264-opus-subs-mkv') return made;
  // FFmpeg 5.1 cannot read the WebVTT track mediabunny writes in MKV, so the subtitle track
  // (SubRip, the most common text subtitle in MKV) is added with ffmpeg itself.
  const r = await runFfmpeg(
    [made, { name: 'subs.srt', bytes: new TextEncoder().encode(SRT) }],
    [
      '-i',
      '/in/fixture.mkv',
      '-i',
      '/in/subs.srt',
      '-map',
      '0',
      '-map',
      '1',
      '-c',
      'copy',
      '-metadata:s:s:0',
      'language=eng',
      '-f',
      'matroska',
      '/subs.mkv',
    ],
    '/subs.mkv',
  );
  if (r.code !== 0 || !r.output) throw new Error(`adding subtitles failed: ${r.log.join('\n')}`);
  return { name: 'fixture.mkv', bytes: r.output };
}

const SRT =
  '1\n00:00:00,500 --> 00:00:02,000\nFirst line\n\n2\n00:00:02,500 --> 00:00:04,000\nSecond line\n';

async function runFfmpeg(
  files: readonly { name: string; bytes: Uint8Array }[],
  args: readonly string[],
  output?: string,
): Promise<{ code: number; log: string[]; output: Uint8Array | null }> {
  const ff = await openFfmpeg();
  try {
    await ff.mount(
      '/in',
      files.map((f) => ({ name: f.name, blob: new Blob([f.bytes as Uint8Array<ArrayBuffer>]) })),
    );
    const code = await ff.exec(args);
    const out = output && code === 0 ? await ff.readFile(output) : null;
    return { code, log: [...ff.log()], output: out };
  } finally {
    ff.terminate();
  }
}

async function noiseClip(): Promise<Uint8Array> {
  const mb = await import('mediabunny');
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target });
  const w = 1280;
  const h = 720;
  const canvas = new OffscreenCanvas(w, h);
  const g = canvas.getContext('2d');
  if (!g) throw new Error('no 2d context');
  const video = new mb.CanvasSource(canvas, {
    codec: 'avc',
    quality: new mb.Quality({ bitrate: NOISE_KBPS * 1000 }),
    keyFrameInterval: 2,
  });
  // Opus where this Chromium has no AAC encoder (Linux); the memory test only needs a large MP4.
  const audio = new mb.AudioBufferSource({
    codec: (await mb.canEncodeAudio('aac')) ? 'aac' : 'opus',
    quality: new mb.Quality({ bitrate: 128_000 }),
  });
  output.addVideoTrack(video, { frameRate: FPS });
  output.addAudioTrack(audio);
  await output.start();
  const img = g.createImageData(w, h);
  for (let f = 0; f < NOISE_SECONDS * FPS; f++) {
    for (let o = 0; o < img.data.length; o += 65536)
      crypto.getRandomValues(img.data.subarray(o, Math.min(img.data.length, o + 65536)));
    g.putImageData(img, 0, 0);
    await video.add(f / FPS, 1 / FPS);
  }
  await audio.add(tone(NOISE_SECONDS));
  await output.finalize();
  if (!target.buffer) throw new Error('no output');
  return new Uint8Array(target.buffer);
}

async function largeDir() {
  return (await navigator.storage.getDirectory()).getDirectoryHandle(LARGE_DIR, { create: true });
}

async function makeLargeFixture(megabytes: number) {
  const clip = await noiseClip();
  const loops = Math.max(1, Math.round((megabytes * 1024 * 1024) / clip.length));
  const r = await runFfmpeg(
    [{ name: 'clip.mp4', bytes: clip }],
    [
      '-stream_loop',
      String(loops - 1),
      '-i',
      '/in/clip.mp4',
      '-c',
      'copy',
      '-f',
      'mp4',
      '/big.mp4',
    ],
    '/big.mp4',
  );
  if (r.code !== 0 || !r.output) throw new Error(r.log.join('\n'));
  const file = await (await largeDir()).getFileHandle(LARGE_NAME, { create: true });
  const out = await file.createWritable();
  await out.write(r.output as Uint8Array<ArrayBuffer>);
  await out.close();
  return { bytes: r.output.length, seconds: loops * NOISE_SECONDS };
}

async function exportLarge() {
  const handle = await (await largeDir()).getFileHandle(LARGE_NAME);
  const disk = await handle.getFile();
  const file = new File([disk], 'large.mp4', { type: 'video/mp4' });
  const t0 = performance.now();
  const r = await runVideoExport({
    file,
    profile: null,
    settings: playerSettings(null, useAppSettings.getState().settings, {}),
    signal: new AbortController().signal,
    onProgress: () => undefined,
  });
  return {
    bytes: r.blob.size,
    container: r.plan.container,
    seconds: (performance.now() - t0) / 1000,
  };
}

export function installVideoHooks(): void {
  window.__clearlyVideo = {
    makeFixture,
    run: runFfmpeg,
    async probe(file) {
      const ff = await openFfmpeg();
      try {
        await ff.mount('/in', [
          { name: file.name, blob: new Blob([file.bytes as Uint8Array<ArrayBuffer>]) },
        ]);
        return await ff.probe([
          '-v',
          'error',
          '-show_streams',
          '-show_format',
          '-of',
          'json',
          `/in/${file.name}`,
        ]);
      } finally {
        ff.terminate();
      }
    },
    makeLargeFixture,
    exportLarge,
    async removeLarge() {
      await (await navigator.storage.getDirectory()).removeEntry(LARGE_DIR, { recursive: true });
    },
    async tempFiles() {
      const { OPFS_TEMP_DIR } = await import('@clearly/audio');
      try {
        const dir = await (
          await navigator.storage.getDirectory()
        ).getDirectoryHandle(OPFS_TEMP_DIR);
        const names: string[] = [];
        for await (const key of (dir as unknown as { keys(): AsyncIterable<string> }).keys())
          names.push(key);
        return names;
      } catch {
        return [];
      }
    },
  };
}
