// Auto Boost runtime (M09). The microphone's level is read four times a second on the app's
// AudioContext (the microphone is never connected to the speakers or recorded), smoothed and
// mapped by core's AutoBoostController, and the result is handed to Clear Audio's settings, which
// pass it through core's precedence function and summed-boost clamp like every other change.
//
// Auto Boost only changes sound while Clear Audio is playing: the player registers its live graph
// here, and the output level for the feedback guard comes from that graph's final tap.

import {
  AutoBoostController,
  type AutoBoostReading,
  type AutoBoostSensitivity,
} from '@clearly/core';
import type { ProcessingGraph } from '@clearly/audio';
import { create } from 'zustand';
import { getAudioEngine } from '../audio/AudioEngine.ts';
import { kv } from '../storage/repos.ts';
import { testHooks } from '../test/hooks.ts';

export type AutoBoostPhase =
  'off' | 'mic' | 'starting' | 'on' | 'denied' | 'nomic' | 'unavailable' | 'error';

export const AUTO_BOOST_TICK_MS = 250;

interface AutoBoostState {
  readonly phase: AutoBoostPhase;
  /** The person said they wear headphones (remembered for this session only). */
  readonly headphonesOk: boolean;
  readonly headphonesDialog: boolean;
  readonly sensitivity: AutoBoostSensitivity;
  readonly reading: AutoBoostReading;
  /** Clear Audio is playing with a live graph. */
  readonly graphActive: boolean;
  /** Turn on: headphones dialog first (once per session), then the microphone pre-prompt. */
  begin: () => void;
  answerHeadphones: (wearing: boolean) => void;
  openHeadphonesInfo: () => void;
  /** From the pre-prompt's button (a user gesture). */
  allowMic: () => Promise<void>;
  cancelMic: () => void;
  stop: () => void;
  resume: () => void;
  setSensitivity: (s: AutoBoostSensitivity) => void;
  loadSensitivity: () => Promise<void>;
}

const IDLE: AutoBoostReading = { roomDbfs: null, boostDb: 0, thresholdDropDb: 0, paused: false };

interface Runtime {
  readonly controller: AutoBoostController;
  readonly analyser: AnalyserNode;
  readonly stop: () => void;
}

let runtime: Runtime | null = null;
let graph: ProcessingGraph | null = null;
let headphonesThen: (() => void) | null = null;

/** The player calls this with its live graph (and null when it goes away). */
export function setAutoBoostGraph(g: ProcessingGraph | null): void {
  graph = g;
  useAutoBoost.setState({ graphActive: g !== null });
  if (runtime && !g) runtime.controller.guard.reset();
}

/** Disconnects one edge; the other end may belong to a graph that is already gone. */
function unlink(from: AudioNode | null, to: AudioNode): void {
  try {
    from?.disconnect(to);
  } catch {
    // Already disconnected.
  }
}

function rmsDbfs(buf: Float32Array): number {
  let p = 0;
  for (const v of buf) p += v * v;
  const ms = p / Math.max(1, buf.length);
  return ms > 0 ? 10 * Math.log10(ms) : -Infinity;
}

/**
 * A stand-in microphone in test builds. Each reading re-reads the hook: { levelDbfs } plays noise
 * at that RMS level; 'echo' feeds the programme back about 20 dB down, as speakers would.
 */
function fakeMicNode(ctx: AudioContext): { node: AudioNode; stop: () => void; tick: () => void } {
  const sum = new GainNode(ctx, { gain: 1 });
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // Uniform noise in [-1, 1) has RMS 1/sqrt(3).
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = new AudioBufferSourceNode(ctx, { buffer: buf, loop: true });
  const noise = new GainNode(ctx, { gain: 0 });
  src.connect(noise).connect(sum);
  src.start();
  const echo = new GainNode(ctx, { gain: 0 });
  echo.connect(sum);
  let tapped: AudioNode | null = null;
  const tick = () => {
    const f = testHooks()?.fakeMic;
    const tap = graph?.taps.analyser ?? null;
    if (tap !== tapped) {
      unlink(tapped, echo);
      if (tap) tap.connect(echo);
      tapped = tap;
    }
    echo.gain.value = f === 'echo' ? 0.1 : 0;
    noise.gain.value = f && f !== 'echo' ? 10 ** (f.levelDbfs / 20) * Math.sqrt(3) : 0;
  };
  tick();
  return {
    node: sum,
    stop: () => {
      src.stop();
      unlink(tapped, echo);
    },
    tick,
  };
}

async function openMic(ctx: AudioContext): Promise<{
  node: AudioNode;
  stop: () => void;
  tick: () => void;
}> {
  if (testHooks()?.fakeMic) return fakeMicNode(ctx);
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
    video: false,
  });
  const node = ctx.createMediaStreamSource(stream);
  return {
    node,
    stop: () => {
      node.disconnect();
      for (const tr of stream.getTracks()) tr.stop();
    },
    tick: () => undefined,
  };
}

export const useAutoBoost = create<AutoBoostState>((set, get) => ({
  phase: 'off',
  headphonesOk: false,
  headphonesDialog: false,
  sensitivity: 'medium',
  reading: IDLE,
  graphActive: false,

  begin() {
    const devices = navigator.mediaDevices as MediaDevices | undefined;
    if (!(devices && 'getUserMedia' in devices) && !testHooks()?.fakeMic) {
      set({ phase: 'unavailable' });
      return;
    }
    const next = () => {
      set({ phase: 'mic' });
    };
    if (get().headphonesOk) {
      next();
      return;
    }
    headphonesThen = next;
    set({ headphonesDialog: true });
  },

  answerHeadphones(wearing) {
    set({ headphonesDialog: false, ...(wearing ? { headphonesOk: true } : {}) });
    const then = headphonesThen;
    headphonesThen = null;
    if (wearing && then) then();
  },

  openHeadphonesInfo() {
    headphonesThen = null;
    set({ headphonesDialog: true });
  },

  async allowMic() {
    const engine = getAudioEngine();
    set({ phase: 'starting' });
    try {
      await engine.start();
      const ctx = engine.context;
      if (!ctx) throw new Error('no audio context');
      const mic = await openMic(ctx);
      const analyser = new AnalyserNode(ctx, { fftSize: 16384 });
      mic.node.connect(analyser);
      const controller = new AutoBoostController();
      controller.sensitivity = get().sensitivity;
      const buf = new Float32Array(analyser.fftSize);
      // The output over the same window, from the graph's final tap, for the feedback guard.
      const outAnalyser = new AnalyserNode(ctx, { fftSize: 16384 });
      const outBuf = new Float32Array(outAnalyser.fftSize);
      let outTapped: AudioNode | null = null;
      // The last quarter second of the microphone (the analyser holds about 0.34 s).
      const recent = Math.round((ctx.sampleRate * AUTO_BOOST_TICK_MS) / 1000);
      const id = window.setInterval(() => {
        mic.tick();
        const tap = graph?.taps.analyser ?? null;
        if (tap !== outTapped) {
          unlink(outTapped, outAnalyser);
          if (tap) tap.connect(outAnalyser);
          outTapped = tap;
        }
        analyser.getFloatTimeDomainData(buf);
        const micDb = rmsDbfs(buf.subarray(buf.length - recent));
        let out = -Infinity;
        if (tap) {
          outAnalyser.getFloatTimeDomainData(outBuf);
          out = rmsDbfs(outBuf.subarray(outBuf.length - recent));
        }
        const r = controller.update(micDb, out, AUTO_BOOST_TICK_MS / 1000);
        const prev = get().reading;
        // Only re-render (and so re-plan the graph) when something visible moved.
        if (
          prev.paused !== r.paused ||
          Math.abs(prev.boostDb - r.boostDb) > 0.05 ||
          Math.abs(prev.thresholdDropDb - r.thresholdDropDb) > 0.05 ||
          Math.abs((prev.roomDbfs ?? -200) - (r.roomDbfs ?? -200)) > 0.5
        )
          set({ reading: r });
      }, AUTO_BOOST_TICK_MS);
      runtime = {
        controller,
        analyser,
        stop: () => {
          window.clearInterval(id);
          unlink(outTapped, outAnalyser);
          mic.node.disconnect();
          mic.stop();
        },
      };
      set({ phase: 'on', reading: IDLE });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      set({
        phase:
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'denied'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'nomic'
              : 'error',
      });
    }
  },

  cancelMic() {
    set({ phase: 'off' });
  },

  stop() {
    runtime?.stop();
    runtime = null;
    set({ phase: 'off', reading: IDLE });
  },

  resume() {
    runtime?.controller.resume();
    set({ reading: { ...get().reading, paused: false } });
  },

  setSensitivity(s) {
    if (runtime) runtime.controller.sensitivity = s;
    set({ sensitivity: s });
    void kv.set('autoBoostSensitivity', s);
  },

  async loadSensitivity() {
    const s = await kv.get('autoBoostSensitivity');
    if (s) {
      if (runtime) runtime.controller.sensitivity = s;
      set({ sensitivity: s });
    }
  },
}));

/** What Clear Audio adds: nothing unless Auto Boost is on and Clear Audio is playing. */
export function autoBoostContribution(
  phase: AutoBoostPhase,
  reading: AutoBoostReading,
): { ambientBoostDb: number; thresholdDropDb: number } | null {
  if (phase !== 'on') return null;
  return { ambientBoostDb: reading.boostDb, thresholdDropDb: reading.thresholdDropDb };
}
