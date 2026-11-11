// 16-bit PCM WAV encoding with TPDF dither. Pure: the WAV worker wraps it, Node tests drive it
// directly. The header is built when the length is final (finish), and the worker puts it first
// in the output Blob, which is the "placeholder patched at the end" design without seeking.

import { WAV_HEADER_BYTES, WAV_MAX_DATA_BYTES } from '../constants.ts';

/** xorshift32: fast, seedable, good enough for dither noise. */
export class XorShift32 {
  private s: number;
  constructor(seed = 0x9e3779b9) {
    this.s = seed >>> 0 || 1;
  }
  /** Uniform in [0, 1). */
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  }
}

export class WavLimitError extends Error {
  constructor(bytes: number) {
    super(
      `This recording would need ${bytes} bytes of audio data, more than the 4 GB a WAV file can hold.`,
    );
    this.name = 'WavLimitError';
  }
}

export interface WavEncoderOptions {
  readonly sampleRate: number;
  readonly channels: number;
  /** Known final length in frames; refused up front if it cannot fit. */
  readonly expectedFrames?: number;
  readonly seed?: number;
  /** Test hook: a smaller data limit than the RIFF maximum. */
  readonly maxDataBytes?: number;
}

export class WavEncoder {
  readonly sampleRate: number;
  readonly channels: number;
  private readonly rng: XorShift32;
  private readonly maxDataBytes: number;
  private bytes = 0;

  constructor(options: WavEncoderOptions) {
    this.sampleRate = options.sampleRate;
    this.channels = options.channels;
    this.rng = new XorShift32(options.seed);
    this.maxDataBytes = options.maxDataBytes ?? WAV_MAX_DATA_BYTES;
    if (options.expectedFrames !== undefined) {
      const expected = options.expectedFrames * this.channels * 2;
      if (expected > this.maxDataBytes) throw new WavLimitError(expected);
    }
  }

  get dataBytes(): number {
    return this.bytes;
  }

  /** Encodes one planar block to interleaved little-endian 16-bit PCM with TPDF dither. */
  encode(planes: readonly Float32Array[]): Uint8Array<ArrayBuffer> {
    if (planes.length !== this.channels) throw new Error('channel count mismatch');
    const frames = planes[0]?.length ?? 0;
    const size = frames * this.channels * 2;
    if (this.bytes + size > this.maxDataBytes) throw new WavLimitError(this.bytes + size);
    const out = new Int16Array(frames * this.channels);
    const ch = this.channels;
    for (let c = 0; c < ch; c++) {
      const p = planes[c];
      if (!p || p.length !== frames) throw new Error('planes must have equal lengths');
      for (let i = 0; i < frames; i++) {
        // TPDF: the difference of two uniform variables spans (-1, 1) LSB, triangular.
        const d = this.rng.next() - this.rng.next();
        let v = Math.round((p[i] ?? 0) * 32767 + d);
        if (v > 32767) v = 32767;
        else if (v < -32768) v = -32768;
        out[i * ch + c] = v;
      }
    }
    this.bytes += size;
    // Int16Array is little-endian on every platform browsers run on; asserted in the tests.
    return new Uint8Array(out.buffer);
  }

  /** The 44-byte header for the data written so far. */
  header(): Uint8Array<ArrayBuffer> {
    return wavHeader(this.sampleRate, this.channels, this.bytes);
  }
}

export function wavHeader(
  sampleRate: number,
  channels: number,
  dataBytes: number,
): Uint8Array<ArrayBuffer> {
  if (dataBytes > WAV_MAX_DATA_BYTES) throw new WavLimitError(dataBytes);
  const b = new ArrayBuffer(WAV_HEADER_BYTES);
  const v = new DataView(b);
  const ascii = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, dataBytes, true);
  return new Uint8Array(b);
}
