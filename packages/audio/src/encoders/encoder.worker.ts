// Encoder worker: WAV (16-bit PCM, TPDF dither) or MP3 (LAME through mediabunny, loaded by dynamic
// import on first MP3 use only). One worker per export.

/// <reference lib="webworker" />

import { WAV_HEADER_BYTES } from '../constants.ts';
import { WavEncoder } from '../dsp/wav.ts';
import { PatchableBlobWriter } from './blobWriter.ts';
import { OpfsWriter } from './opfsWriter.ts';
import type { EncoderInit, FromEncoder, ToEncoder } from './protocol.ts';

interface Encoder {
  write(left: Float32Array, right: Float32Array): Promise<void>;
  finish(): Promise<Blob>;
  abort(): Promise<void>;
}

declare const self: DedicatedWorkerGlobalScope;

async function createWav(init: Extract<EncoderInit, { format: 'wav' }>): Promise<Encoder> {
  const enc = new WavEncoder({
    sampleRate: init.sampleRate,
    channels: 2,
    ...(init.expectedFrames !== undefined ? { expectedFrames: init.expectedFrames } : {}),
  });
  const disk = init.opfsName ? await OpfsWriter.open(init.opfsName) : null;
  if (disk) {
    // On disk: a placeholder header now, the real one (with the final length) at the end.
    disk.write(new Uint8Array(WAV_HEADER_BYTES));
    return {
      write(left, right) {
        disk.write(enc.encode([left, right]));
        return Promise.resolve();
      },
      async finish() {
        disk.write(enc.header(), 0);
        const file = await disk.finish();
        return new File([file], file.name, { type: 'audio/wav' });
      },
      abort: () => disk.remove(),
    };
  }
  const out = new PatchableBlobWriter();
  return {
    write(left, right) {
      out.write(enc.encode([left, right]));
      return Promise.resolve();
    },
    finish() {
      return Promise.resolve(out.toBlob('audio/wav', enc.header()));
    },
    abort: () => Promise.resolve(),
  };
}

async function createMp3(init: Extract<EncoderInit, { format: 'mp3' }>): Promise<Encoder> {
  const mb = await import('mediabunny');
  if (!(await mb.canEncodeAudio('mp3'))) {
    const { registerMp3Encoder } = await import('@mediabunny/mp3-encoder');
    registerMp3Encoder();
  }
  const out = new PatchableBlobWriter();
  const writable = new WritableStream<{ type: 'write'; data: Uint8Array; position: number }>({
    write(chunk) {
      out.write(chunk.data, chunk.position);
    },
  });
  const output = new mb.Output({
    format: new mb.Mp3OutputFormat(),
    target: new mb.StreamTarget(writable),
  });
  const source = new mb.AudioSampleSource({
    codec: 'mp3',
    quality: new mb.Quality({ bitrate: init.bitrateKbps * 1000, bitrateMode: 'constant' }),
  });
  output.addAudioTrack(source);
  await output.start();
  let frames = 0;
  return {
    async write(left, right) {
      const n = left.length;
      const planar = new Float32Array(n * 2);
      planar.set(left, 0);
      planar.set(right, n);
      const sample = new mb.AudioSample({
        data: planar,
        format: 'f32-planar',
        numberOfChannels: 2,
        sampleRate: init.sampleRate,
        timestamp: frames / init.sampleRate,
      });
      frames += n;
      try {
        await source.add(sample);
      } finally {
        sample.close();
      }
    },
    async finish() {
      await output.finalize();
      return out.toBlob('audio/mpeg');
    },
    async abort() {
      await output.cancel();
    },
  };
}

let encoder: Encoder | null = null;

function reply(m: FromEncoder): void {
  self.postMessage(m);
}

async function handle(m: ToEncoder): Promise<void> {
  try {
    switch (m.type) {
      case 'init':
        encoder = m.init.format === 'wav' ? await createWav(m.init) : await createMp3(m.init);
        reply({ type: 'ok', id: m.id });
        break;
      case 'write':
        if (!encoder) throw new Error('the encoder was not started');
        await encoder.write(m.left, m.right);
        reply({ type: 'ok', id: m.id });
        break;
      case 'finish': {
        if (!encoder) throw new Error('the encoder was not started');
        const blob = await encoder.finish();
        encoder = null;
        reply({ type: 'done', id: m.id, blob });
        break;
      }
      case 'abort':
        await encoder?.abort();
        encoder = null;
        reply({ type: 'ok', id: m.id });
        break;
    }
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    reply({ type: 'error', id: m.id, name: err.name, message: err.message });
  }
}

// Messages are handled strictly in order.
let queue: Promise<void> = Promise.resolve();
self.onmessage = (e: MessageEvent<ToEncoder>) => {
  const m = e.data;
  queue = queue.then(() => handle(m));
};
