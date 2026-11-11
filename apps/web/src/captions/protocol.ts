import type { Word } from '@clearly/core';

export type ToTranscriber =
  | { readonly type: 'load'; readonly repo: string; readonly preferGpu: boolean }
  | {
      readonly type: 'transcribe';
      readonly id: number;
      readonly start: number;
      readonly samples: Float32Array;
    };

export type FromTranscriber =
  | { readonly type: 'ready'; readonly device: 'webgpu' | 'wasm'; readonly threads: number }
  | { readonly type: 'words'; readonly id: number; readonly words: readonly Word[] }
  | { readonly type: 'error'; readonly id?: number; readonly message: string };
