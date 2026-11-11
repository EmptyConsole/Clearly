// Test doubles: a fake audio engine on a virtual clock, a fake platform, and a render helper.

import type { CalibrationRamp, ScheduledTone, WarbleOptions } from '@clearly/audio';
import { CALIBRATION_MAX_DBFS } from '@clearly/core';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { CheckAudio } from '../audio/AudioEngine.ts';
import { EngineProvider } from '../audio/EngineContext.tsx';
import { PlatformProvider } from '../platform/PlatformContext.tsx';
import type { Capabilities, PlatformAdapter } from '../platform/types.ts';
import { appRoutes, ROUTER_FUTURE } from '../app/router.tsx';

export class FakeRamp implements CalibrationRamp {
  onsetTime: number;
  topTime: number;
  stopped = false;
  private resolveEnded!: () => void;
  readonly ended = new Promise<void>((r) => {
    this.resolveEnded = r;
  });
  constructor(private readonly audio: FakeAudio) {
    this.onsetTime = audio.time;
    this.topTime = audio.time + 3.2;
  }
  levelAt(t: number = this.audio.time): number {
    const k = Math.max(0, Math.min(32, Math.floor((t - this.onsetTime) / 0.1)));
    return -60 + 1.5 * k;
  }
  stop(): number {
    this.stopped = true;
    return this.levelAt();
  }
  /** Simulates the ramp reaching the top with no answer. */
  reachTop(): void {
    this.audio.time = this.topTime + 0.2;
    this.resolveEnded();
  }
}

export class FakeAudio implements CheckAudio {
  time = 0;
  started = 0;
  tones: WarbleOptions[] = [];
  ramps: FakeRamp[] = [];
  readonly toneLatencyS = 0.002;
  start(): Promise<void> {
    this.started += 1;
    return Promise.resolve();
  }
  now(): number {
    return this.time;
  }
  playWarble(o: WarbleOptions): Promise<ScheduledTone> {
    this.tones.push(o);
    const t0 = o.startAt ?? this.time;
    return Promise.resolve({
      scheduledTime: t0,
      onsetTime: t0 + this.toneLatencyS,
      endTime: t0 + 0.35,
      peakDbfs: Math.min(-6, o.peakDbfs),
    });
  }
  calibrationRamp(): Promise<CalibrationRamp> {
    const r = new FakeRamp(this);
    this.ramps.push(r);
    return Promise.resolve(r);
  }
  /** Virtual clock: jumps to the target time after a macrotask, so React can render. */
  readonly waitUntil = (time: number, signal: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
      setTimeout(() => {
        if (signal.aborted) {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
          return;
        }
        this.time = Math.max(this.time, time);
        resolve();
      }, 0);
    });
  /** Moves the clock forward (for calibration timing). */
  advance(seconds: number): void {
    this.time += seconds;
  }
}

export const CAL_TOP = CALIBRATION_MAX_DBFS;

export const allCapabilities = (over: Partial<Capabilities> = {}): Capabilities => ({
  tabAudioCapture: false,
  systemAudioCapture: false,
  virtualCableRouting: false,
  outputDeviceSelection: false,
  nativeFileDialogs: false,
  floatingCaptions: false,
  installPrompt: false,
  backgroundAudio: false,
  wakeLock: false,
  webShare: false,
  microphone: false,
  ...over,
});

export function fakePlatform(over: Partial<PlatformAdapter> = {}): PlatformAdapter & {
  saved: { name: string; size: number }[];
} {
  const saved: { name: string; size: number }[] = [];
  return {
    kind: 'web',
    capabilities: allCapabilities(),
    listAudioSources: () => Promise.resolve([]),
    startCapture: () => Promise.reject(new Error('no capture')),
    saveFile: (b, o) => {
      saved.push({ name: o.suggestedName, size: b.size });
      return Promise.resolve('saved');
    },
    openFile: () => Promise.resolve(null),
    showFloatingCaptions: () => Promise.resolve(),
    hideFloatingCaptions: () => Promise.resolve(),
    requestPersistentStorage: () => Promise.resolve('granted'),
    openExternal: () => Promise.resolve(),
    saved,
    ...over,
  };
}

export function renderApp(path: string, audio = new FakeAudio(), platform = fakePlatform()) {
  const router = createMemoryRouter([{ path: '/', children: appRoutes }], {
    initialEntries: [path],
    future: ROUTER_FUTURE,
  });
  const utils = render(
    <PlatformProvider adapter={platform}>
      <EngineProvider audio={audio}>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </EngineProvider>
    </PlatformProvider>,
  );
  return { ...utils, audio, platform, router, path: () => router.state.location.pathname };
}
