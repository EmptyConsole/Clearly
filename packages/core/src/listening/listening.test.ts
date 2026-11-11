import { describe, expect, it } from 'vitest';
import { createRng } from '../rng.ts';
import {
  DIN_MAX_SNR_DB,
  DIN_MIN_SNR_DB,
  dinCategory,
  dinNoiseDbfs,
  makeTriplet,
  nextSnr,
  scoreDin,
  tripletCorrect,
} from './din.ts';
import {
  addListening,
  alertDue,
  localDay,
  reminderDue,
  stereoRmsDbfs,
  zoneFor,
} from './exposure.ts';
import { ltassFitErrorsDb, LTASS_FREQS_HZ } from './ltass.ts';

describe('digits in noise', () => {
  it('never repeats a digit within a triplet', () => {
    const rng = createRng(4);
    for (let i = 0; i < 500; i++) expect(new Set(makeTriplet(rng)).size).toBe(3);
  });
  it('steps 2 dB and clamps to [-20, +10]', () => {
    expect(nextSnr(0, true)).toBe(-2);
    expect(nextSnr(0, false)).toBe(2);
    expect(nextSnr(DIN_MIN_SNR_DB, true)).toBe(DIN_MIN_SNR_DB);
    expect(nextSnr(DIN_MAX_SNR_DB, false)).toBe(DIN_MAX_SNR_DB);
  });
  it('scores triplets 5-12 plus the 13th', () => {
    // Always correct: 0, -2, ..., -22 clamped at -20.
    const snrs: number[] = [];
    const correct: boolean[] = [];
    let s = 0;
    for (let i = 0; i < 12; i++) {
      snrs.push(s);
      correct.push(true);
      s = nextSnr(s, true);
    }
    // Triplets 5..12: -8 -10 -12 -14 -16 -18 -20 -20, 13th -20.
    expect(scoreDin(snrs, correct)).toBeCloseTo(
      (-8 - 10 - 12 - 14 - 16 - 18 - 20 - 20 - 20) / 9,
      6,
    );
    // Alternating right/wrong around -6.
    const alt = [0, -2, -4, -6, -8, -6, -8, -6, -8, -6, -8, -6];
    const altC = [true, true, true, true, false, true, false, true, false, true, false, true];
    expect(scoreDin(alt, altC)).toBeCloseTo((-8 - 6 - 8 - 6 - 8 - 6 - 8 - 6 - 8) / 9, 6);
    expect(() => scoreDin([0], [true])).toThrow();
  });
  it('treats Not sure as wrong and categorises', () => {
    expect(tripletCorrect([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(tripletCorrect([1, 2, 3], [1, null, 3])).toBe(false);
    expect(dinCategory(-9)).toBe('good');
    expect(dinCategory(-8)).toBe('good');
    expect(dinCategory(-6)).toBe('some');
    expect(dinCategory(-3)).toBe('considerable');
  });
  it('keeps noise at Lc - 15 and never above -12 dBFS', () => {
    expect(dinNoiseDbfs(-30)).toBe(-45);
    expect(dinNoiseDbfs(0)).toBe(-15);
    expect(dinNoiseDbfs(5)).toBe(-12);
  });
});

describe('speech-shaped noise filter', () => {
  it('fits the ANSI S3.5 speech spectrum within 2 dB from 125 Hz to 8 kHz', () => {
    const e = ltassFitErrorsDb();
    expect(e).toHaveLength(LTASS_FREQS_HZ.length);
    for (const x of e) expect(Math.abs(x)).toBeLessThanOrEqual(2);
  });
});

describe('safe-listening tracker', () => {
  it('buckets against Lc - 3 dB', () => {
    expect(zoneFor(-34, -30)).toBe('comfortable');
    expect(zoneFor(-33, -30)).toBe('loud');
    expect(zoneFor(-27, -30)).toBe('loud');
    expect(zoneFor(-26.9, -30)).toBe('veryLoud');
  });
  it('measures stereo power mean', () => {
    const one = new Float32Array(100).fill(1);
    expect(stereoRmsDbfs(one, new Float32Array(100))).toBeCloseTo(-3.01, 2);
    expect(stereoRmsDbfs(new Float32Array(10), new Float32Array(10))).toBe(-Infinity);
  });
  it('splits listening across midnight into two local days', () => {
    const end = new Date(2026, 10, 10, 0, 0, 30); // 30 s after midnight
    const m = addListening('loud', 90, end);
    expect(m.get('2026-11-10')?.loudMinutes).toBeCloseTo(0.5, 6);
    expect(m.get('2026-11-09')?.loudMinutes).toBeCloseTo(1, 6);
  });
  it('uses local dates across a DST change', () => {
    // Whatever the machine's zone, consecutive local midnights give consecutive keys.
    const a = new Date(2026, 2, 29, 12, 0, 0);
    const b = new Date(2026, 2, 30, 12, 0, 0);
    expect(localDay(a)).toBe('2026-03-29');
    expect(localDay(b)).toBe('2026-03-30');
    const m = addListening('comfortable', 3600, new Date(2026, 2, 29, 0, 30));
    expect([...m.keys()].sort()).toEqual(['2026-03-28', '2026-03-29']);
  });
  it('alerts once per day', () => {
    expect(alertDue(15, 15, false)).toBe(true);
    expect(alertDue(30, 15, true)).toBe(false);
    expect(alertDue(10, 15, false)).toBe(false);
  });
});

describe('Hearing Check reminders', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  it('is due after 6 months and at most once a week', () => {
    expect(reminderDue('2026-04-01T12:00:00Z', null, 6, now)).toBe(true);
    expect(reminderDue('2026-08-01T12:00:00Z', null, 6, now)).toBe(false);
    expect(reminderDue('2026-04-01T12:00:00Z', '2026-11-06T12:00:00Z', 6, now)).toBe(false);
    expect(reminderDue('2026-04-01T12:00:00Z', '2026-11-01T12:00:00Z', 6, now)).toBe(true);
    expect(reminderDue('2026-04-01T12:00:00Z', null, 0, now)).toBe(false);
    expect(reminderDue(null, null, 6, now)).toBe(false);
  });
});
