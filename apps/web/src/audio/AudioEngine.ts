// AudioEngine (RULES.md): owns the one AudioContext, requested at 48000 Hz and created only inside
// a user gesture. It resumes the context whenever it is suspended, applies the silent-switch
// handling (navigator.audioSession first, a silent looping media element only where that is
// absent and the primary pointer is coarse), and exposes its state through a Zustand store.
//
// It imports nothing from @clearly/audio at module level: the graph and tone generator load by
// dynamic import, so the engine adds almost nothing to the app shell.

import type { CalibrationRamp, ScheduledTone, ToneGenerator, WarbleOptions } from '@clearly/audio';
import { createEngineStore, type EngineStore } from './engineStore.ts';
import { silentWav } from './silence.ts';

export const ENGINE_SAMPLE_RATE = 48000;

interface AudioSessionLike {
  type: string;
}

/** What the Hearing Check needs from the engine; component tests pass a fake. */
export interface CheckAudio {
  /** Call inside a user gesture handler. Creates or resumes the context. */
  start(): Promise<void>;
  /** Audio-clock time in seconds. */
  now(): number;
  playWarble(o: WarbleOptions): Promise<ScheduledTone>;
  calibrationRamp(): Promise<CalibrationRamp>;
  /** Seconds of output latency added by the tone path (the Safety limiter lookahead). */
  readonly toneLatencyS: number;
  /**
   * Optional clock override (component tests use a virtual clock). The real engine leaves it
   * undefined and the runner waits on the audio clock.
   */
  readonly waitUntil?: (time: number, signal: AbortSignal) => Promise<void>;
}

export class AudioEngine implements CheckAudio {
  readonly store: EngineStore = createEngineStore();
  private ctx: AudioContext | null = null;
  private tones: Promise<ToneGenerator> | null = null;
  private silentEl: HTMLAudioElement | null = null;
  toneLatencyS = 0;

  get context(): AudioContext | null {
    return this.ctx;
  }

  /**
   * Must be called synchronously from a user gesture (click, pointerdown, keydown). The context
   * is constructed before the first await so the gesture's activation applies to it.
   */
  start(): Promise<void> {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.applySessionHandling();
      const ctx = new AudioContext({ sampleRate: ENGINE_SAMPLE_RATE, latencyHint: 'interactive' });
      this.ctx = ctx;
      this.store.setState({ status: 'starting', sampleRate: ctx.sampleRate });
      ctx.addEventListener('statechange', () => {
        this.syncState();
      });
    }
    return this.resume();
  }

  /** Pauses all output on purpose (for example when headphones are unplugged). */
  async hold(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    this.store.setState({ held: true });
    await ctx.suspend().catch(() => undefined);
    this.syncState();
  }

  /** Resumes a suspended context (after an OS interruption, a hidden tab, or a hold). */
  async resume(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    this.store.setState({ held: false });
    // 'interrupted' is a newer state some engines report; treat it like suspended.
    if ((ctx.state as string) !== 'running') {
      try {
        await ctx.resume();
      } catch {
        this.store.setState({ status: 'error' });
        throw new Error('the audio context could not resume');
      }
    }
    this.syncState();
  }

  private syncState(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = ctx.state as string;
    this.store.setState({
      status: s === 'running' ? 'running' : s === 'closed' ? 'closed' : 'suspended',
    });
  }

  private applySessionHandling(): void {
    const nav = navigator as Navigator & { audioSession?: AudioSessionLike };
    if (nav.audioSession) {
      try {
        nav.audioSession.type = 'playback';
        this.store.setState({ sessionHandling: 'audioSession' });
        return;
      } catch {
        // fall through to the element fallback
      }
    }
    if (window.matchMedia('(pointer: coarse)').matches) {
      const el = new Audio(URL.createObjectURL(silentWav()));
      el.loop = true;
      el.setAttribute('playsinline', '');
      void el.play().catch(() => undefined);
      this.silentEl = el;
      this.store.setState({ sessionHandling: 'silentElement' });
      return;
    }
    this.store.setState({ sessionHandling: 'none' });
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private requireCtx(): AudioContext {
    if (!this.ctx) throw new Error('start() must be called from a user gesture first');
    return this.ctx;
  }

  private toneGenerator(): Promise<ToneGenerator> {
    const ctx = this.requireCtx();
    this.tones ??= import('@clearly/audio').then(async ({ createToneGenerator }) => {
      const gen = await createToneGenerator(ctx);
      this.toneLatencyS = gen.latencySamples / ctx.sampleRate;
      return gen;
    });
    return this.tones;
  }

  async playWarble(o: WarbleOptions): Promise<ScheduledTone> {
    await this.resume();
    return (await this.toneGenerator()).playWarble(o);
  }

  async calibrationRamp(): Promise<CalibrationRamp> {
    await this.resume();
    return (await this.toneGenerator()).calibrationRamp();
  }

  /** Loads the tone generator early (after start) so the first beep is not delayed. */
  async prepareTones(): Promise<void> {
    await this.toneGenerator();
  }

  async close(): Promise<void> {
    const gen = this.tones ? await this.tones.catch(() => null) : null;
    gen?.dispose();
    this.tones = null;
    this.silentEl?.pause();
    this.silentEl = null;
    await this.ctx?.close();
    this.ctx = null;
    this.store.setState({ status: 'closed' });
  }
}

let shared: AudioEngine | null = null;

/** The app's one engine. */
export function getAudioEngine(): AudioEngine {
  shared ??= new AudioEngine();
  return shared;
}
