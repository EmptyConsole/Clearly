// Messages between the encoder sinks (main thread) and the encoder workers.

import type { Mp3BitrateKbps } from '../constants.ts';

export type EncoderInit =
  | {
      readonly format: 'wav';
      readonly sampleRate: number;
      readonly expectedFrames?: number;
      /** Write into this OPFS file (folder OPFS_TEMP_DIR) instead of memory, where supported. */
      readonly opfsName?: string;
    }
  | {
      readonly format: 'mp3';
      readonly sampleRate: number;
      readonly bitrateKbps: Mp3BitrateKbps;
    };

export type ToEncoder =
  | { readonly type: 'init'; readonly id: number; readonly init: EncoderInit }
  | {
      readonly type: 'write';
      readonly id: number;
      readonly left: Float32Array;
      readonly right: Float32Array;
    }
  | { readonly type: 'finish'; readonly id: number }
  | { readonly type: 'abort'; readonly id: number };

export type FromEncoder =
  | { readonly type: 'ok'; readonly id: number }
  | { readonly type: 'done'; readonly id: number; readonly blob: Blob }
  | {
      readonly type: 'error';
      readonly id: number;
      readonly name: string;
      readonly message: string;
    };
