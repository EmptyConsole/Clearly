// Main-thread side of the transcriber worker: one request at a time, in order.

import type { Word } from '@clearly/core';
import type { FromTranscriber, ToTranscriber } from './protocol.ts';

export class Transcriber {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly waiting = new Map<
    number,
    { resolve: (w: readonly Word[]) => void; reject: (e: Error) => void }
  >();
  private readyResolve: ((d: { device: 'webgpu' | 'wasm' }) => void) | null = null;
  private readyReject: ((e: Error) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL('./transcriber.worker.ts', import.meta.url), {
      type: 'module',
      name: 'clearly-captions',
    });
    this.worker.onmessage = (e: MessageEvent<FromTranscriber>) => {
      const m = e.data;
      if (m.type === 'ready') this.readyResolve?.({ device: m.device });
      else if (m.type === 'words') {
        this.waiting.get(m.id)?.resolve(m.words);
        this.waiting.delete(m.id);
      } else if (m.id !== undefined) {
        this.waiting.get(m.id)?.reject(new Error(m.message));
        this.waiting.delete(m.id);
      } else this.readyReject?.(new Error(m.message));
    };
  }

  load(repo: string, preferGpu = true): Promise<{ device: 'webgpu' | 'wasm' }> {
    return new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
      this.post({ type: 'load', repo, preferGpu });
    });
  }

  transcribe(start: number, samples: Float32Array): Promise<readonly Word[]> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.post({ type: 'transcribe', id, start, samples }, [samples.buffer]);
    });
  }

  private post(m: ToTranscriber, transfer: Transferable[] = []): void {
    this.worker.postMessage(m, transfer);
  }

  dispose(): void {
    this.worker.terminate();
    for (const w of this.waiting.values()) w.reject(new Error('stopped'));
    this.waiting.clear();
  }
}
