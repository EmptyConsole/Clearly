// Background cleanup core (M06): RNNoise on 480-sample frames per channel, with a ring buffer so
// it works for any render quantum, a fixed total delay equal to CLEANUP_LATENCY_SAMPLES, and the
// wet/dry crossfade (strength) inside. With no module loaded, or at strength 0, it outputs the
// dry signal delayed by the same amount, so the graph's latency never changes.
//
// The RNNoise build (Shiguredo, via @sapphi-red/web-noise-suppressor; see DECISIONS M06) is plain
// WebAssembly with three imports, so it is instantiated here directly from a compiled
// WebAssembly.Module, without Emscripten's loader, and the worklet never fetches anything.

export const RNNOISE_FRAME = 480;
/** RNNoise expects samples scaled like 16-bit PCM. */
export const RNNOISE_SCALE = 32768;
/**
 * RNNoise's own delay: its analysis window spans two frames, so a frame's output carries the
 * previous frame's centre. Measured by cross-correlation in cleanupCore.test.ts: 480 samples.
 */
export const RNNOISE_ALGORITHM_DELAY = 480;

export interface RnnoiseExports {
  readonly memory: WebAssembly.Memory;
  readonly malloc: (n: number) => number;
  readonly free: (p: number) => void;
  readonly rnnoise_create: (model: number) => number;
  readonly rnnoise_destroy: (st: number) => void;
  readonly rnnoise_process_frame: (st: number, out: number, input: number) => number;
  readonly emscripten_stack_init?: () => void;
  readonly __wasm_call_ctors?: () => void;
}

/** Instantiates the RNNoise module synchronously (allowed in worklets and workers). */
export function instantiateRnnoise(module: WebAssembly.Module): RnnoiseExports {
  let memory: WebAssembly.Memory | null = null;
  const imports = {
    env: {
      emscripten_memcpy_big: (dest: number, src: number, num: number) => {
        if (!memory) return;
        const heap = new Uint8Array(memory.buffer);
        heap.copyWithin(dest, src, src + num);
      },
      emscripten_resize_heap: (requested: number) => {
        if (!memory) return 0;
        const pages = Math.ceil((requested - memory.buffer.byteLength) / 65536);
        try {
          memory.grow(Math.max(1, pages));
          return 1;
        } catch {
          return 0;
        }
      },
      __assert_fail: () => {
        throw new Error('RNNoise assertion failed');
      },
    },
  };
  const instance = new WebAssembly.Instance(module, imports);
  const ex = instance.exports as unknown as RnnoiseExports;
  memory = ex.memory;
  ex.emscripten_stack_init?.();
  ex.__wasm_call_ctors?.();
  return ex;
}

class Channel {
  readonly state: number;
  readonly inPtr: number;
  readonly outPtr: number;
  /** Input collected for the next frame. */
  readonly frameIn = new Float32Array(RNNOISE_FRAME);
  filled = 0;
  /** Processed output waiting to be played, in order. */
  readonly wet: Float32Array;
  wetRead = 0;
  wetWrite = 0;
  constructor(
    readonly ex: RnnoiseExports,
    wetCapacity: number,
  ) {
    this.state = ex.rnnoise_create(0);
    this.inPtr = ex.malloc(RNNOISE_FRAME * 4);
    this.outPtr = ex.malloc(RNNOISE_FRAME * 4);
    this.wet = new Float32Array(wetCapacity);
  }
}

export class CleanupCore {
  private readonly channels: Channel[] = [];
  private readonly dry: Float32Array[];
  private dryWrite = 0;
  private readonly latency: number;
  private readonly wetCapacity: number;
  private strength = 0;
  private strengthTarget = 0;
  private readonly smooth: number;
  private vadSum = 0;
  private vadFrames = 0;
  /** A view of WebAssembly memory, rebuilt only if the memory grows (no allocation per frame). */
  private heap: Float32Array | null = null;

  constructor(
    sampleRate: number,
    latencySamples: number,
    ex: RnnoiseExports | null,
    numChannels = 2,
  ) {
    this.latency = latencySamples;
    // The dry delay line holds exactly `latency` samples.
    this.dry = Array.from({ length: numChannels }, () => new Float32Array(latencySamples + 1));
    // Wet: produced in 480-sample bursts, read one sample at a time `latency` behind the input.
    this.wetCapacity = 4 * RNNOISE_FRAME + latencySamples;
    this.smooth = 1 - Math.exp(-1 / (0.03 * sampleRate));
    if (ex) {
      // The wet stream is pre-filled with (latency - A) zeros, so its total delay is latency. A
      // frame's samples are only ready once the whole frame has arrived, so the pre-fill must be
      // at least one frame (479 samples, rounded up to 480).
      if (latencySamples - RNNOISE_ALGORITHM_DELAY < RNNOISE_FRAME) {
        throw new Error('the cleanup latency is shorter than RNNoise needs');
      }
      for (let c = 0; c < numChannels; c++) {
        const ch = new Channel(ex, this.wetCapacity);
        ch.wetWrite = latencySamples - RNNOISE_ALGORITHM_DELAY;
        this.channels.push(ch);
      }
    }
  }

  get hasModule(): boolean {
    return this.channels.length > 0;
  }

  setStrength(s: number): void {
    this.strengthTarget = Math.max(0, Math.min(1, s));
  }

  /** Mean voice-activity probability since the last call (0 when none), then resets it. */
  takeVad(): number {
    const v = this.vadFrames > 0 ? this.vadSum / this.vadFrames : 0;
    this.vadSum = 0;
    this.vadFrames = 0;
    return v;
  }

  private runFrame(ch: Channel): void {
    const ex = ch.ex;
    let heap = this.heap;
    if (!heap || heap.buffer !== ex.memory.buffer) {
      heap = new Float32Array(ex.memory.buffer);
      this.heap = heap;
    }
    const inBase = ch.inPtr >> 2;
    const frameIn = ch.frameIn;
    for (let i = 0; i < RNNOISE_FRAME; i++) heap[inBase + i] = (frameIn[i] ?? 0) * RNNOISE_SCALE;
    const vad = ex.rnnoise_process_frame(ch.state, ch.outPtr, ch.inPtr);
    this.vadSum += vad;
    this.vadFrames++;
    // process_frame may have grown memory; re-check the view.
    if (heap.buffer !== ex.memory.buffer) {
      heap = new Float32Array(ex.memory.buffer);
      this.heap = heap;
    }
    const outBase = ch.outPtr >> 2;
    const cap = this.wetCapacity;
    const wet = ch.wet;
    let w = ch.wetWrite % cap;
    for (let i = 0; i < RNNOISE_FRAME; i++) {
      wet[w] = (heap[outBase + i] ?? 0) / RNNOISE_SCALE;
      if (++w === cap) w = 0;
    }
    ch.wetWrite += RNNOISE_FRAME;
    ch.filled = 0;
  }

  /** inputs[c] and outputs[c] are per-channel blocks of `frames` samples. */
  process(inputs: readonly Float32Array[], outputs: Float32Array[], frames: number): void {
    const n = this.dry.length;
    for (let i = 0; i < frames; i++) {
      this.strength += (this.strengthTarget - this.strength) * this.smooth;
      const s = this.hasModule ? this.strength : 0;
      const readIdx = (this.dryWrite + 1) % (this.latency + 1);
      for (let c = 0; c < n; c++) {
        const x = inputs[c]?.[i] ?? inputs[0]?.[i] ?? 0;
        const line = this.dry[c];
        if (!line) continue;
        line[this.dryWrite] = x;
        const dryOut = line[readIdx] ?? 0;
        let wetOut = dryOut;
        const ch = this.channels[c];
        if (ch) {
          ch.frameIn[ch.filled++] = x;
          if (ch.filled === RNNOISE_FRAME) this.runFrame(ch);
          wetOut = ch.wet[ch.wetRead % this.wetCapacity] ?? 0;
          ch.wetRead++;
        }
        const o = outputs[c];
        if (o) o[i] = s * wetOut + (1 - s) * dryOut;
      }
      this.dryWrite = (this.dryWrite + 1) % (this.latency + 1);
    }
  }

  dispose(): void {
    for (const ch of this.channels) {
      ch.ex.rnnoise_destroy(ch.state);
      ch.ex.free(ch.inPtr);
      ch.ex.free(ch.outPtr);
    }
    this.channels.length = 0;
  }
}
