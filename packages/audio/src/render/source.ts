// Chunked sources and encoder sinks: the renderer never holds a whole decoded file or a whole
// result in memory.

import { ENGINE_SAMPLE_RATE_HZ } from '../constants.ts';

export interface StereoBlock {
  readonly left: Float32Array;
  readonly right: Float32Array;
}

/** Float32 stereo blocks at 48 kHz, in order, with a known total length. */
export interface ChunkedSourceReader extends AsyncIterable<StereoBlock> {
  readonly sampleRate: number;
  readonly durationFrames: number;
}

/**
 * Where rendered audio goes. write() takes ownership of the blocks (their buffers may be
 * transferred to a worker) and resolves when the sink is ready for more; finish() resolves with
 * the encoded result.
 */
export interface EncoderSink<T> {
  write(blocks: readonly StereoBlock[]): Promise<void>;
  finish(): Promise<T>;
  abort(reason?: unknown): void;
}

export class SampleRateError extends Error {
  constructor(rate: number) {
    super(
      `This audio is at ${rate} Hz. The renderer works at ${ENGINE_SAMPLE_RATE_HZ} Hz; resample it first.`,
    );
    this.name = 'SampleRateError';
  }
}

/** Reads an AudioBuffer (tests and short files). Mono is copied to both channels. */
export class AudioBufferReader implements ChunkedSourceReader {
  readonly sampleRate: number;
  readonly durationFrames: number;

  constructor(
    private readonly buffer: AudioBuffer,
    private readonly blockFrames = 65536,
  ) {
    if (buffer.sampleRate !== ENGINE_SAMPLE_RATE_HZ) throw new SampleRateError(buffer.sampleRate);
    if (buffer.numberOfChannels < 1) throw new Error('the buffer has no channels');
    this.sampleRate = buffer.sampleRate;
    this.durationFrames = buffer.length;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<StereoBlock> {
    const L = this.buffer.getChannelData(0);
    const R = this.buffer.numberOfChannels > 1 ? this.buffer.getChannelData(1) : L;
    for (let s = 0; s < this.durationFrames; s += this.blockFrames) {
      const e = Math.min(this.durationFrames, s + this.blockFrames);
      // Copies, so the consumer may keep or transfer them.
      yield { left: L.slice(s, e), right: R.slice(s, e) };
      await Promise.resolve();
    }
  }
}

/**
 * A sliding window over a ChunkedSourceReader: random access to the frames the current segment
 * needs, discarding frames that are no longer needed.
 */
export class InputWindow {
  private readonly iterator: AsyncIterator<StereoBlock>;
  private chunks: { start: number; block: StereoBlock }[] = [];
  private end = 0;
  private done = false;

  constructor(source: ChunkedSourceReader) {
    this.iterator = source[Symbol.asyncIterator]();
  }

  /** Reads until frame `until` (exclusive) is available or the source ends. */
  async ensure(until: number): Promise<void> {
    while (!this.done && this.end < until) {
      const r = await this.iterator.next();
      if (r.done) {
        this.done = true;
        break;
      }
      const block = r.value;
      if (block.left.length !== block.right.length) throw new Error('block channels differ');
      this.chunks.push({ start: this.end, block });
      this.end += block.left.length;
    }
  }

  /** Copies frames [start, start + length) into L and R at offset 0; zeros outside the source. */
  copy(start: number, length: number, L: Float32Array, R: Float32Array): void {
    L.fill(0, 0, length);
    R.fill(0, 0, length);
    for (const { start: cs, block } of this.chunks) {
      const ce = cs + block.left.length;
      const a = Math.max(start, cs);
      const b = Math.min(start + length, ce);
      if (b <= a) continue;
      L.set(block.left.subarray(a - cs, b - cs), a - start);
      R.set(block.right.subarray(a - cs, b - cs), a - start);
    }
  }

  /** Forgets chunks that end at or before `frame`. */
  dropBefore(frame: number): void {
    this.chunks = this.chunks.filter((c) => c.start + c.block.left.length > frame);
  }
}
