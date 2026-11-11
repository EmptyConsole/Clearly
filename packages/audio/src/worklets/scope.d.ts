// Minimal ambient types for AudioWorkletGlobalScope (W3C Web Audio API 1.1, section 1.32).
// TypeScript ships no AudioWorklet lib, and the DOM lib describes the main thread instead, so the
// worklet sources compile against these declarations only (tsconfig.worklet.json).

interface WorkletMessageEvent {
  readonly data: unknown;
}

interface WorkletMessagePort {
  postMessage(message: unknown, transfer?: unknown[]): void;
  onmessage: ((event: WorkletMessageEvent) => void) | null;
}

interface AudioParamDescriptor {
  name: string;
  defaultValue?: number;
  minValue?: number;
  maxValue?: number;
  automationRate?: 'a-rate' | 'k-rate';
}

interface AudioWorkletNodeOptionsInScope {
  readonly numberOfInputs?: number;
  readonly numberOfOutputs?: number;
  readonly processorOptions?: unknown;
}

declare class AudioWorkletProcessor {
  readonly port: WorkletMessagePort;
  constructor(options?: AudioWorkletNodeOptionsInScope);
}

type AudioWorkletProcessorConstructor = new (
  options: AudioWorkletNodeOptionsInScope,
) => AudioWorkletProcessor & {
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
};

declare function registerProcessor(name: string, ctor: AudioWorkletProcessorConstructor): void;
declare const sampleRate: number;
declare const currentTime: number;
declare const currentFrame: number;

// WebAssembly exists in AudioWorkletGlobalScope (the JavaScript built-ins); only what the cleanup
// processor uses is declared here.
declare namespace WebAssembly {
  interface Module {
    readonly __wasmModule?: never;
  }
  class Memory {
    readonly buffer: ArrayBuffer;
    grow(pages: number): number;
  }
  class Instance {
    constructor(module: Module, imports?: Record<string, Record<string, unknown>>);
    readonly exports: Record<string, unknown>;
  }
}
