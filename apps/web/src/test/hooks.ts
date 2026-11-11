// Test-build hooks. Present only when VITE_TEST_HOOKS is "1" (the Playwright dev server sets it);
// production builds replace the flag with false and drop this code.

import type { Trial } from '@clearly/core';
import type { ProcessingGraph } from '@clearly/audio';

export interface TestHooks {
  /** Answers each trial instead of a person (scripted responses). */
  responder?: (trial: Trial) => boolean;
  /** Multiplies every Hearing Check duration. */
  timeScale?: number;
  /** Answers the calibration ramp at this level in dBFS instead of waiting for a tap. */
  calibrationLevelDbfs?: number;
  /** Shortens the sync debounce (5 s in production). */
  syncDebounceMs?: number;
  /** Counts listening time faster in tests (seconds counted per real second). */
  trackerTimeScale?: number;
  /**
   * Replaces the microphone for Auto Boost: a noise source at this RMS level (dBFS), read again
   * on every reading so a test can script the room; 'echo' feeds the programme back instead, as
   * speakers would.
   */
  fakeMic?: { levelDbfs: number } | 'echo';
  /** Sleep-timer minutes last this many real seconds (Calm Sounds). */
  calmSecondsPerMinute?: number;
  /** Calm Sounds sleep fade length in seconds (60 in production). */
  calmFadeSeconds?: number;
  /** Lowers the 1 GB video export limit so a test can check the oversized path. */
  videoMaxBytes?: number;
  /** Makes video fixtures take the no-WebCodecs-AAC path (as on Linux), to test it anywhere. */
  forceFfmpegAac?: boolean;
}

/** Set by the player in test builds so Playwright can measure the live graph. */
export interface PlayerProbe {
  graph: ProcessingGraph | null;
  /** Renders the current file with the current settings to WAV (the export reference). */
  reference: (() => Promise<Blob>) | null;
}

declare global {
  interface Window {
    __clearlyTest?: TestHooks;
    __clearlyPlayer?: PlayerProbe;
    /** Hum Filter per-frame estimates (test builds). */
    __clearlyHumLog?: (number | null)[];
  }
}

export const TEST_HOOKS_ENABLED: boolean = import.meta.env.VITE_TEST_HOOKS === '1';

export function testHooks(): TestHooks | undefined {
  if (!TEST_HOOKS_ENABLED) return undefined;
  return window.__clearlyTest;
}
