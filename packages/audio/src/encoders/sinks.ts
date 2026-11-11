// Encoder sinks for renderOffline. Each export gets its own Web Worker; audio blocks are
// transferred (not copied) to it, and write() resolves when the worker has encoded them, which
// gives the renderer natural backpressure.

import {
  ENGINE_SAMPLE_RATE_HZ,
  MP3_BITRATE_DEFAULT_KBPS,
  type Mp3BitrateKbps,
} from '../constants.ts';
import type { EncoderSink, StereoBlock } from '../render/source.ts';
import type { EncoderInit, FromEncoder, ToEncoder } from './protocol.ts';

export class EncoderError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

class WorkerSink implements EncoderSink<Blob> {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly waiting = new Map<
    number,
    { resolve: (m: FromEncoder) => void; reject: (e: unknown) => void }
  >();
  private readonly ready: Promise<FromEncoder>;
  private closed = false;

  constructor(init: EncoderInit) {
    this.worker = new Worker(new URL('./encoder.worker.ts', import.meta.url), {
      type: 'module',
      name: `clearly-${init.format}-encoder`,
    });
    this.worker.onmessage = (e: MessageEvent<FromEncoder>) => {
      const w = this.waiting.get(e.data.id);
      if (!w) return;
      this.waiting.delete(e.data.id);
      if (e.data.type === 'error') w.reject(new EncoderError(e.data.name, e.data.message));
      else w.resolve(e.data);
    };
    this.worker.onerror = (e) => {
      const err = new EncoderError('EncoderError', e.message || 'the encoder stopped');
      for (const w of this.waiting.values()) w.reject(err);
      this.waiting.clear();
    };
    this.ready = this.send({ type: 'init', id: this.nextId++, init });
  }

  private send(m: ToEncoder, transfer: Transferable[] = []): Promise<FromEncoder> {
    return new Promise((resolve, reject) => {
      this.waiting.set(m.id, { resolve, reject });
      this.worker.postMessage(m, transfer);
    });
  }

  async write(blocks: readonly StereoBlock[]): Promise<void> {
    await this.ready;
    for (const b of blocks) {
      const transfer: Transferable[] = [b.left.buffer];
      if (b.right.buffer !== b.left.buffer) transfer.push(b.right.buffer);
      await this.send({ type: 'write', id: this.nextId++, left: b.left, right: b.right }, transfer);
    }
  }

  async finish(): Promise<Blob> {
    await this.ready;
    const m = await this.send({ type: 'finish', id: this.nextId++ });
    this.close();
    if (m.type !== 'done') throw new EncoderError('EncoderError', 'the encoder did not finish');
    return m.blob;
  }

  abort(): void {
    if (this.closed) return;
    void this.send({ type: 'abort', id: this.nextId++ })
      .catch(() => undefined)
      .finally(() => {
        this.close();
      });
  }

  private close(): void {
    this.closed = true;
    this.worker.terminate();
  }
}

export interface WavSinkOptions {
  readonly sampleRate?: number;
  /** Known length: lets the encoder refuse a file over the 4 GB WAV limit before it starts. */
  readonly expectedFrames?: number;
  /**
   * Write into this file in the Origin Private File System (folder OPFS_TEMP_DIR) where the
   * browser supports it, keeping a long file out of memory. The result is then a File read from
   * disk; the caller deletes it when done (removeOpfsTemp).
   */
  readonly opfsName?: string;
}

/** 16-bit PCM WAV with TPDF dither, encoded in a worker. */
export function createWavSink(o: WavSinkOptions = {}): EncoderSink<Blob> {
  return new WorkerSink({
    format: 'wav',
    sampleRate: o.sampleRate ?? ENGINE_SAMPLE_RATE_HZ,
    ...(o.expectedFrames !== undefined ? { expectedFrames: o.expectedFrames } : {}),
    ...(o.opfsName !== undefined ? { opfsName: o.opfsName } : {}),
  });
}

export interface Mp3SinkOptions {
  readonly sampleRate?: number;
  readonly bitrateKbps?: Mp3BitrateKbps;
}

/** Constant-bitrate MP3 (128, 192, 256 or 320 kbps; default 192), encoded in a worker. */
export function createMp3Sink(o: Mp3SinkOptions = {}): EncoderSink<Blob> {
  return new WorkerSink({
    format: 'mp3',
    sampleRate: o.sampleRate ?? ENGINE_SAMPLE_RATE_HZ,
    bitrateKbps: o.bitrateKbps ?? MP3_BITRATE_DEFAULT_KBPS,
  });
}
