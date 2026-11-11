// ChunkedSourceReader for files (M05 export, M07 pre-transcription).
//
// Chunked path: mediabunny demuxes MP4/MOV, WebM/Matroska, Ogg, MP3, WAV, FLAC, AAC/ADTS and
// decodes with WebCodecs AudioDecoder (or its own PCM decoder), sample by sample, so the whole
// decoded file is never held in memory. Samples are downmixed or upmixed to stereo and resampled
// to the target rate with StreamResampler.
// Fallback: decodeAudioData through an OfflineAudioContext at the target rate (the browser
// resamples), only when the decoded result fits the memory budget.

import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';
import { ENGINE_SAMPLE_RATE_HZ } from '../constants.ts';
import { StreamResampler } from '../dsp/resampler.ts';
import { AudioBufferReader, type ChunkedSourceReader, type StereoBlock } from './source.ts';

/** About 150 MB of float samples: 6.5 minutes of stereo at 48 kHz. */
export const DECODE_BUDGET_BYTES = 150 * 1024 * 1024;

export class FileReadError extends Error {
  constructor(
    readonly reason: 'no-audio' | 'unsupported' | 'too-long',
    readonly detail?: string,
  ) {
    super(`${reason}${detail ? `: ${detail}` : ''}`);
    this.name = 'FileReadError';
  }
}

export interface OpenedFile {
  readonly reader: ChunkedSourceReader;
  /** True when the file is decoded piece by piece (any length). */
  readonly chunked: boolean;
  readonly durationSeconds: number;
  readonly sourceSampleRate: number;
  readonly codec: string | null;
}

function toStereo(sample: {
  numberOfChannels: number;
  numberOfFrames: number;
  copyTo: (d: Float32Array, o: { planeIndex: number; format: 'f32-planar' }) => void;
}): [Float32Array, Float32Array] {
  const n = sample.numberOfFrames;
  const chans: Float32Array[] = [];
  for (let c = 0; c < sample.numberOfChannels; c++) {
    const buf = new Float32Array(n);
    sample.copyTo(buf, { planeIndex: c, format: 'f32-planar' });
    chans.push(buf);
  }
  const L = chans[0] ?? new Float32Array(n);
  if (chans.length === 1) return [L, L.slice()];
  if (chans.length === 2) return [L, chans[1] ?? L];
  // More than two channels: ITU-style downmix of the front pair plus centre (channel 2).
  const R = chans[1] ?? L;
  const C = chans[2];
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = C ? (C[i] ?? 0) * Math.SQRT1_2 : 0;
    outL[i] = (L[i] ?? 0) + c;
    outR[i] = (R[i] ?? 0) + c;
  }
  return [outL, outR];
}

class MediabunnyReader implements ChunkedSourceReader {
  readonly sampleRate: number;
  constructor(
    private readonly file: Blob,
    readonly durationFrames: number,
    private readonly trackRate: number,
    targetRate: number,
  ) {
    this.sampleRate = targetRate;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<StereoBlock> {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(this.file) });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track) throw new FileReadError('no-audio');
      const sink = new AudioSampleSink(track);
      const rs =
        this.trackRate === this.sampleRate
          ? null
          : new StreamResampler(this.trackRate, this.sampleRate, 2);
      let emitted = 0;
      const limit = this.durationFrames;
      const emit = (l: Float32Array, r: Float32Array): StereoBlock | null => {
        const take = Math.min(l.length, limit - emitted);
        if (take <= 0) return null;
        emitted += take;
        return take === l.length
          ? { left: l, right: r }
          : { left: l.slice(0, take), right: r.slice(0, take) };
      };
      for await (const sample of sink.samples()) {
        // Samples before time zero (encoder priming) are not presented.
        if (sample.timestamp + sample.duration <= 0) {
          sample.close();
          continue;
        }
        const [l, r] = toStereo(sample);
        sample.close();
        const out = rs ? rs.push([l, r]) : [l, r];
        const b = emit(out[0] ?? new Float32Array(0), out[1] ?? new Float32Array(0));
        if (b) yield b;
      }
      if (rs) {
        const tail = rs.flush();
        const b = emit(tail[0] ?? new Float32Array(0), tail[1] ?? new Float32Array(0));
        if (b) yield b;
      }
      // Pad with silence if the decoder delivered fewer frames than the container promised.
      while (emitted < limit) {
        const n = Math.min(65536, limit - emitted);
        emitted += n;
        yield { left: new Float32Array(n), right: new Float32Array(n) };
      }
    } finally {
      input.dispose();
    }
  }
}

export interface OpenFileOptions {
  readonly targetRate?: number;
  /** Tests: force the decodeAudioData path. */
  readonly forceFallback?: boolean;
  readonly budgetBytes?: number;
}

/** Opens a file for chunked reading at the target rate (48 kHz by default). */
export async function openFileReader(file: Blob, o: OpenFileOptions = {}): Promise<OpenedFile> {
  const target = o.targetRate ?? ENGINE_SAMPLE_RATE_HZ;
  const budget = o.budgetBytes ?? DECODE_BUDGET_BYTES;
  let codec: string | null = null;
  let fallbackReason = 'unsupported';
  if (!o.forceFallback) {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track) throw new FileReadError('no-audio');
      codec = await track.getCodec();
      const trackRate = await track.getSampleRate();
      if (await track.canDecode()) {
        const seconds = await input.computeDuration([track]);
        const frames = Math.max(0, Math.round(seconds * target));
        return {
          reader: new MediabunnyReader(file, frames, trackRate, target),
          chunked: true,
          durationSeconds: seconds,
          sourceSampleRate: trackRate,
          codec,
        };
      }
    } catch (e) {
      if (e instanceof FileReadError && e.reason === 'no-audio') throw e;
      fallbackReason = e instanceof Error ? e.message : 'unsupported';
    } finally {
      input.dispose();
    }
  }
  // Fallback: decode all at once, if it fits. 8 bytes per stereo frame of float32. Decoded float
  // audio is never smaller than the encoded file, so a file larger than the budget is refused
  // before it is read into memory at all.
  if (file.size > budget) throw new FileReadError('too-long');
  const ctx = new OfflineAudioContext(2, 1, target);
  let buffer: AudioBuffer;
  try {
    // Check the size before decoding: the encoded size is a poor guide, so decode then measure.
    buffer = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new FileReadError('unsupported', codec ?? fallbackReason);
  }
  if (buffer.length * 8 > budget) throw new FileReadError('too-long');
  return {
    reader: new AudioBufferReader(buffer),
    chunked: false,
    durationSeconds: buffer.duration,
    sourceSampleRate: buffer.sampleRate,
    codec,
  };
}
