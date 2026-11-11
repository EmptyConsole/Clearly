// Hum Filter in Clear Audio (M09). Auto: an AnalyserNode on Tap A (8192-point FFT, Blackman
// window, no smoothing) is read every 500 ms; the spectra are averaged, estimated and tracked by
// packages/audio's pure detector, and a lock sets the notch bank. 50 Hz and 60 Hz modes use fixed
// notches. The graph smooths every frequency and Q change.

import type * as Audio from '@clearly/audio';
import type { HumSettings, HumState, ProcessingGraph } from '@clearly/audio';
import { useEffect, useMemo, useState } from 'react';
import { TEST_HOOKS_ENABLED } from '../test/hooks.ts';

export type HumMode = 'off' | 'auto' | '50' | '60';

type HumLib = Pick<
  typeof Audio,
  | 'HumTracker'
  | 'SpectrumAverager'
  | 'estimateHum'
  | 'lockedHumNotches'
  | 'fixedHumNotches'
  | 'HUM_FFT_SIZE'
  | 'HUM_INTERVAL_MS'
>;

export interface HumFilterView {
  readonly settings: HumSettings | undefined;
  /** The frequency being removed, or null (Auto still listening, or Off). */
  readonly removingHz: number | null;
  /** How many harmonics above the fundamental are notched. */
  readonly harmonics: number;
}

export function useHumFilter(
  graph: ProcessingGraph | null,
  ctx: AudioContext | null,
  mode: HumMode,
): HumFilterView {
  const [lib, setLib] = useState<HumLib | null>(null);
  const [locked, setLocked] = useState<HumState | null>(null);

  useEffect(() => {
    if (mode === 'off' || lib) return;
    void import('@clearly/audio').then(setLib);
  }, [mode, lib]);

  useEffect(() => {
    if (mode !== 'auto' || !graph || !ctx || !lib) return;
    const analyser = new AnalyserNode(ctx, {
      fftSize: lib.HUM_FFT_SIZE,
      smoothingTimeConstant: 0,
    });
    graph.taps.captionsTapA.connect(analyser);
    const avg = new lib.SpectrumAverager();
    const tracker = new lib.HumTracker();
    const db = new Float32Array(analyser.frequencyBinCount);
    let last: number | null = null;
    const id = window.setInterval(() => {
      analyser.getFloatFrequencyData(db);
      const est = lib.estimateHum(avg.push(db), ctx.sampleRate, lib.HUM_FFT_SIZE);
      const st = tracker.update(est, ctx.currentTime);
      if (TEST_HOOKS_ENABLED) (window.__clearlyHumLog ??= []).push(est ? est.f0 : null);
      const f = st.locked ? st.f0 : null;
      if (f === last || (f !== null && last !== null && Math.abs(f - last) < 0.01)) return;
      last = f;
      setLocked(st.locked ? st : null);
    }, lib.HUM_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
      try {
        graph.taps.captionsTapA.disconnect(analyser);
      } catch {
        // The graph may already be disposed.
      }
      setLocked(null);
    };
  }, [mode, graph, ctx, lib]);

  return useMemo<HumFilterView>(() => {
    if (mode === 'off' || !lib) return { settings: undefined, removingHz: null, harmonics: 0 };
    if (mode === '50' || mode === '60') {
      const base = mode === '50' ? 50 : 60;
      return {
        settings: { enabled: true, notches: lib.fixedHumNotches(base) },
        removingHz: base,
        harmonics: 5,
      };
    }
    const f0 = locked?.f0 ?? null;
    if (f0 === null)
      return { settings: { enabled: false, notches: [] }, removingHz: null, harmonics: 0 };
    return {
      settings: { enabled: true, notches: lib.lockedHumNotches(f0) },
      removingHz: f0,
      harmonics: 5,
    };
  }, [mode, lib, locked]);
}
