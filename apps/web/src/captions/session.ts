// Runs captions for one source.
//   File: reads the file ahead of playback at 16 kHz mono (packages/audio openFileReader), so cues
//     are exactly timed; results are kept in the captionCache by file hash, so reopening is instant.
//   Live (tab capture, or a file that cannot be read ahead): audio from Tap A through the capture
//     worklet, transcribed as it arrives, with backlog dropping past 15 s.

import {
  CAPTION_RATE,
  CAPTION_CACHE_VERSION,
  HOP_SECONDS,
  WindowCollector,
  dropBacklog,
  hasVoice,
  mergeWords,
  wordsToCues,
  type Cue,
  type Window,
  type Word,
} from '@clearly/core';
import { captionCache } from '../storage/repos.ts';
import { fileHash } from '../storage/fileHash.ts';
import { CAPTION_MODELS, type CaptionModel } from './assets.ts';
import { Transcriber } from './client.ts';

export interface CaptionStatus {
  readonly phase: 'loading' | 'ready' | 'working' | 'complete' | 'error';
  readonly live: boolean;
  /** Seconds of the file captioned so far (file mode). */
  readonly readySeconds: number;
  readonly durationSeconds: number;
  readonly device: 'webgpu' | 'wasm' | null;
  readonly skipped: boolean;
  readonly fallback: boolean;
}

export interface CaptionCallbacks {
  readonly onCues: (cues: readonly Cue[]) => void;
  readonly onStatus: (s: CaptionStatus) => void;
}

export class CaptionSession {
  private transcriber: Transcriber | null = null;
  private words: Word[] = [];
  private stopped = false;
  private status: CaptionStatus = {
    phase: 'loading',
    live: false,
    readySeconds: 0,
    durationSeconds: 0,
    device: null,
    skipped: false,
    fallback: false,
  };
  private liveQueue: Window[] = [];
  private liveBusy = false;
  private collector = new WindowCollector();
  private liveSeconds = 0;

  constructor(
    private readonly model: CaptionModel,
    private readonly cb: CaptionCallbacks,
  ) {}

  private set(patch: Partial<CaptionStatus>): void {
    this.status = { ...this.status, ...patch };
    this.cb.onStatus(this.status);
  }

  private emitCues(): void {
    this.cb.onCues(wordsToCues(this.words));
  }

  private async ensureModel(): Promise<Transcriber> {
    if (this.transcriber) return this.transcriber;
    const t = new Transcriber();
    this.transcriber = t;
    const { device } = await t.load(CAPTION_MODELS[this.model]);
    this.set({ device, phase: 'ready' });
    return t;
  }

  private async run(w: Window): Promise<void> {
    if (!hasVoice(w.samples)) return;
    const t = await this.ensureModel();
    const incoming = await t.transcribe(w.start, w.samples);
    this.words = mergeWords(this.words, incoming, w.start);
    this.emitCues();
  }

  /** File mode. Returns false when the file cannot be read ahead (use live mode instead). */
  async startFile(file: Blob, durationSeconds: number): Promise<boolean> {
    this.set({ durationSeconds, live: false });
    const id = await fileHash(file);
    const cached = await captionCache.get(id).catch(() => null);
    const modelName = CAPTION_MODELS[this.model];
    if (
      cached &&
      cached.model === modelName &&
      cached.coveredSeconds >= cached.durationSeconds - 0.5
    ) {
      this.cb.onCues(cached.segments);
      this.set({ phase: 'complete', readySeconds: durationSeconds });
      return true;
    }
    let reader;
    try {
      const { openFileReader } = await import('@clearly/audio');
      reader = (await openFileReader(file, { targetRate: CAPTION_RATE })).reader;
    } catch {
      this.set({ fallback: true });
      return false;
    }
    try {
      await this.ensureModel();
      this.set({ phase: 'working' });
      let windows = 0;
      for await (const block of reader) {
        if (this.isStopped()) return true;
        const mono = new Float32Array(block.left.length);
        for (let i = 0; i < mono.length; i++)
          mono[i] = 0.5 * ((block.left[i] ?? 0) + (block.right[i] ?? 0));
        for (const w of this.collector.push(mono)) {
          if (this.isStopped()) return true;
          await this.run(w);
          windows++;
          // Words before the middle of the next overlap are final.
          this.set({ readySeconds: Math.min(durationSeconds, w.start + HOP_SECONDS) });
          if (windows % 8 === 0)
            await this.save(id, modelName, this.status.readySeconds, durationSeconds);
        }
      }
      for (const w of this.collector.flush()) await this.run(w);
      this.set({ phase: 'complete', readySeconds: durationSeconds });
      await this.save(id, modelName, durationSeconds, durationSeconds);
      return true;
    } catch {
      this.set({ phase: 'error' });
      return true;
    }
  }

  private async save(id: string, model: string, covered: number, duration: number): Promise<void> {
    await captionCache
      .put({
        schemaVersion: CAPTION_CACHE_VERSION,
        id,
        createdAt: new Date().toISOString(),
        model,
        coveredSeconds: covered,
        durationSeconds: duration,
        segments: wordsToCues(this.words),
      })
      .catch(() => undefined);
  }

  /** Live mode: feed 16 kHz mono chunks from the capture worklet. Times start at 0. */
  startLive(): void {
    this.set({ live: true, phase: 'loading' });
    void this.ensureModel().catch(() => {
      this.set({ phase: 'error' });
    });
  }

  pushLive(samples: Float32Array): void {
    if (this.stopped) return;
    this.liveSeconds += samples.length / CAPTION_RATE;
    this.liveQueue.push(...this.collector.push(samples));
    const d = dropBacklog(this.liveQueue, this.liveSeconds);
    this.liveQueue = d.queue;
    if (d.skipped) this.set({ skipped: true });
    void this.pump();
  }

  /** Seconds of live audio received (the live clock captions are timed against). */
  get liveTime(): number {
    return this.liveSeconds;
  }

  private async pump(): Promise<void> {
    if (this.liveBusy) return;
    this.liveBusy = true;
    try {
      while (!this.stopped && this.liveQueue.length > 0) {
        const w = this.liveQueue.shift();
        if (w) await this.run(w);
      }
    } catch {
      this.set({ phase: 'error' });
    } finally {
      this.liveBusy = false;
    }
  }

  /** A method, so loops re-read the flag that stop() sets while they await. */
  private isStopped(): boolean {
    return this.stopped;
  }

  stop(): void {
    this.stopped = true;
    this.transcriber?.dispose();
    this.transcriber = null;
  }
}
