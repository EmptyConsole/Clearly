import type { Cue } from '@clearly/core';
import { MIN_DISPLAY_SECONDS } from '@clearly/core';

export type CaptionScheme = 'white' | 'yellow' | 'dark';
export interface CaptionDisplay {
  readonly size: number;
  readonly lines: number;
  readonly scheme: CaptionScheme;
}
export const DEFAULT_DISPLAY: CaptionDisplay = { size: 28, lines: 2, scheme: 'white' };

/** Token colours for each scheme (checked by check:tokens). */
export const SCHEME_CLASS: Readonly<Record<CaptionScheme, string>> = {
  white: 'bg-[var(--t-color-caption-white-bg)] text-[var(--t-color-caption-white-fg)]',
  yellow: 'bg-[var(--t-color-caption-yellow-bg)] text-[var(--t-color-caption-yellow-fg)]',
  dark: 'bg-[var(--t-color-caption-dark-bg)] text-[var(--t-color-caption-dark-fg)]',
};

/** File mode: the cue at the media time. */
export function cueAt(cues: readonly Cue[], t: number): Cue | null {
  for (const c of cues) if (t >= c.start && t <= c.end + 0.3) return c;
  return null;
}

export interface Shown {
  readonly cue: Cue;
  /** When it appeared on screen (seconds, any clock). */
  readonly since: number;
}

/**
 * Live mode: a caption stays on screen at least 6 s, then the newest one replaces it (live
 * captions arrive late, so each must stay long enough to read).
 */
export function nextLiveCue(current: Shown | null, newest: Cue | null, now: number): Shown | null {
  if (!newest) return current;
  if (!current) return { cue: newest, since: now };
  if (newest.start === current.cue.start && newest.text === current.cue.text) return current;
  if (now - current.since >= MIN_DISPLAY_SECONDS) return { cue: newest, since: now };
  // Same cue growing (more words arrived): update the text but keep its time on screen.
  if (newest.start === current.cue.start) return { cue: newest, since: current.since };
  return current;
}
