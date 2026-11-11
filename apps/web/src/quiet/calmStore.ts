// Calm Sounds runtime (M09). One Calm Sounds graph at a time on the app's AudioContext, kept in
// this module so sound carries on while the person moves around the app. The volume cap is fixed
// when the graph is built (from the active profile's Lc) and enforced inside the graph.

import type { CalmGraph, CalmKind } from '@clearly/audio';
import { create } from 'zustand';
import { getAudioEngine } from '../audio/AudioEngine.ts';
import { tracker } from '../health/tracker.ts';
import { t, type MessageId } from '../copy/en.ts';
import { kv } from '../storage/repos.ts';
import { testHooks } from '../test/hooks.ts';

export type CalmSound = Exclude<CalmKind, 'tone'>;
export type SleepTimer = 15 | 30 | 60 | 90 | 'night';

interface CalmState {
  /** What is playing: a sound, the pitch-match tone, or nothing. */
  readonly playing: CalmSound | 'tone' | null;
  readonly kind: CalmSound;
  readonly volume: number;
  readonly timer: SleepTimer;
  /** Real time (ms) the sound stops, or null for All night / not playing. */
  readonly endsAt: number | null;
  readonly fading: boolean;
  /** The sleep timer ended the sound. */
  readonly timerEnded: boolean;
  readonly error: boolean;
  load: () => Promise<void>;
  /** Called from a tap. */
  play: (kind: CalmSound, pitchHz: number, lcDbfs: number | null) => Promise<void>;
  playTone: (hz: number, lcDbfs: number | null) => Promise<void>;
  stop: () => void;
  setKind: (kind: CalmSound, pitchHz: number) => void;
  setVolume: (v: number) => void;
  setTimer: (t: SleepTimer) => void;
}

let graph: CalmGraph | null = null;
let graphCap: number | null = null;
let untrack: (() => void) | null = null;
let timers: number[] = [];

const TONE_VOLUME = 0.35;

// Screen lock (M14): phones may keep playing a media element in the background where they stop an
// AudioContext's own output. So, where Media Session exists, Calm Sounds plays through
// graph -> MediaStreamAudioDestinationNode -> a hidden <audio> element, with lock-screen metadata.
// The volume cap and the Safety limiter stay inside the graph either way. Verified results per
// platform are in docs/MOBILE.txt; the Calm Sounds card only claims what was verified.
let lockRoute: { el: HTMLAudioElement; dest: MediaStreamAudioDestinationNode } | null = null;

function canUseLockRoute(): boolean {
  return (
    typeof MediaStreamAudioDestinationNode !== 'undefined' &&
    'mediaSession' in navigator &&
    typeof HTMLAudioElement !== 'undefined'
  );
}

function openLockRoute(ctx: AudioContext): MediaStreamAudioDestinationNode | null {
  if (!canUseLockRoute()) return null;
  closeLockRoute();
  const dest = new MediaStreamAudioDestinationNode(ctx, { channelCount: 2 });
  const el = new Audio();
  el.srcObject = dest.stream;
  el.setAttribute('playsinline', '');
  lockRoute = { el, dest };
  void el.play().catch(() => undefined);
  return dest;
}

function closeLockRoute(): void {
  if (!lockRoute) return;
  lockRoute.el.pause();
  lockRoute.el.srcObject = null;
  lockRoute.dest.disconnect();
  lockRoute = null;
  try {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
  } catch {
    // Media Session is optional.
  }
}

function setLockMetadata(kind: CalmKind, onStop: () => void): void {
  if (!lockRoute || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: kind === 'tone' ? t('calm.title') : t(`calm.kind.${kind}` as MessageId),
      artist: t('app.name'),
      album: t('calm.title'),
    });
    navigator.mediaSession.playbackState = 'playing';
    navigator.mediaSession.setActionHandler('pause', onStop);
    navigator.mediaSession.setActionHandler('stop', onStop);
  } catch {
    // Some actions are not supported everywhere.
  }
}

function clearTimers(): void {
  for (const id of timers) window.clearTimeout(id);
  timers = [];
}

function minuteMs(): number {
  return (testHooks()?.calmSecondsPerMinute ?? 60) * 1000;
}

function fadeSeconds(): number {
  return testHooks()?.calmFadeSeconds ?? 60;
}

async function ensureGraph(
  kind: CalmKind,
  pitchHz: number,
  lcDbfs: number | null,
  volume: number,
): Promise<CalmGraph> {
  const engine = getAudioEngine();
  await engine.start();
  const ctx = engine.context;
  if (!ctx) throw new Error('no audio context');
  const a = await import('@clearly/audio');
  const cap = a.calmCapDbfs(lcDbfs);
  if (graph && graphCap === cap) {
    graph.setSource(kind, pitchHz);
    graph.setVolume(volume);
    return graph;
  }
  dispose();
  const dest = ctx instanceof AudioContext ? openLockRoute(ctx) : null;
  graph = await a.createCalmGraph(ctx, {
    kind,
    pitchHz,
    capDbfs: cap,
    volume,
    ...(dest ? { output: dest } : {}),
  });
  graphCap = cap;
  untrack = tracker.attachFeed(graph.tracker);
  return graph;
}

function dispose(): void {
  clearTimers();
  untrack?.();
  untrack = null;
  graph?.dispose();
  graph = null;
  graphCap = null;
  closeLockRoute();
}

export const useCalm = create<CalmState>((set, get) => {
  const schedule = () => {
    clearTimers();
    const t = get().timer;
    if (t === 'night' || get().playing === null || get().playing === 'tone') {
      set({ endsAt: null, fading: false });
      return;
    }
    const total = t * minuteMs();
    const fade = Math.min(total, fadeSeconds() * 1000);
    set({ endsAt: Date.now() + total, fading: false });
    timers.push(
      window.setTimeout(() => {
        set({ fading: true });
        void graph?.fadeOut(fade / 1000);
      }, total - fade),
      window.setTimeout(() => {
        dispose();
        set({ playing: null, endsAt: null, fading: false, timerEnded: true });
      }, total),
    );
  };

  return {
    playing: null,
    kind: 'pink',
    volume: 0.5,
    timer: 30,
    endsAt: null,
    fading: false,
    timerEnded: false,
    error: false,

    async load() {
      const [k, v] = await Promise.all([kv.get('calmKind'), kv.get('calmVolume')]);
      set({ ...(k ? { kind: k } : {}), ...(v !== undefined ? { volume: v } : {}) });
    },

    async play(kind, pitchHz, lcDbfs) {
      set({ error: false, timerEnded: false });
      try {
        await ensureGraph(kind, pitchHz, lcDbfs, get().volume);
        setLockMetadata(kind, () => {
          get().stop();
        });
        set({ playing: kind, kind });
        schedule();
      } catch {
        dispose();
        set({ playing: null, error: true });
      }
    },

    async playTone(hz, lcDbfs) {
      set({ error: false, timerEnded: false });
      try {
        clearTimers();
        await ensureGraph('tone', hz, lcDbfs, Math.min(get().volume, TONE_VOLUME));
        setLockMetadata('tone', () => {
          get().stop();
        });
        set({ playing: 'tone', endsAt: null, fading: false });
      } catch {
        dispose();
        set({ playing: null, error: true });
      }
    },

    stop() {
      dispose();
      set({ playing: null, endsAt: null, fading: false });
    },

    setKind(kind, pitchHz) {
      set({ kind });
      void kv.set('calmKind', kind);
      if (graph && get().playing && get().playing !== 'tone') {
        graph.setSource(kind, pitchHz);
        setLockMetadata(kind, () => {
          get().stop();
        });
        set({ playing: kind });
      }
    },

    setVolume(v) {
      set({ volume: v });
      void kv.set('calmVolume', v);
      if (get().playing === 'tone') graph?.setVolume(Math.min(v, TONE_VOLUME));
      else if (!get().fading) graph?.setVolume(v);
    },

    setTimer(t) {
      set({ timer: t });
      if (get().playing && get().playing !== 'tone') schedule();
    },
  };
});
