import { describe, expect, it } from 'vitest';
import { BAND_FREQUENCIES_HZ, EXPRESS_FREQUENCIES_HZ } from '../constants.ts';
import type { Ear, SessionResult, TrackResult } from '../estimator/types.ts';
import { NORMAL_OFFSET_DB } from '../tables.ts';
import { AUDIOGRAM, migrate } from '../schemas/index.ts';
import { audiogramFromSession, starterAudiogram } from './audiogram.ts';
import { computeLoss } from './loss.ts';
import { referralReasons } from './referral.ts';
import { rateReliability, type Reliability } from './reliability.ts';

const LC = -30;
/** Builds track results from a loss per ear at the Express bands (1 kHz ref = -75 dBFS). */
function tracks(loss: Record<Ear, number[]>, sd = 4): TrackResult[] {
  const out: TrackResult[] = [];
  for (const ear of ['left', 'right'] as const) {
    EXPRESS_FREQUENCIES_HZ.forEach((hz, i) => {
      const dbfs = -75 + NORMAL_OFFSET_DB[hz] + (loss[ear][i] as number);
      out.push({
        trackId: `${ear}-${hz}`,
        ear,
        hz,
        thresholdDbfs: dbfs,
        thresholdRelLc: dbfs - LC,
        sdDb: sd,
        trials: 3,
        massBelowFloor: 0,
        massAboveCeiling: 0,
        heardAtQuietest: false,
        noResponseAtLoudest: false,
      });
    });
  }
  return out;
}
const idx = (hz: number): number => BAND_FREQUENCIES_HZ.indexOf(hz as 1000);

describe('loss', () => {
  it('is relative to the better ear at 1 kHz and never negative', () => {
    const l = computeLoss(tracks({ left: [0, 0, 10, 20, 30], right: [5, 6, 12, 22, 40] }));
    expect(l.left.lossDb[idx(1000)]).toBeCloseTo(0, 10);
    expect(l.right.lossDb[idx(1000)]).toBeCloseTo(6, 10);
    expect(l.left.lossDb[idx(4000)]).toBeCloseTo(20, 10);
    expect(l.right.lossDb[idx(8000)]).toBeCloseTo(40, 10);
    const better = computeLoss(tracks({ left: [-5, -3, 0, 0, 0], right: [0, 0, 0, 0, 0] }));
    expect(Math.min(...better.left.lossDb)).toBe(0);
  });

  it('marks unmeasured bands as estimated (null uncertainty) and interpolates them', () => {
    const l = computeLoss(tracks({ left: [0, 0, 10, 30, 50], right: [0, 0, 10, 30, 50] }, 4.5));
    for (const hz of [250, 3000, 6000]) expect(l.left.uncertaintyDb[idx(hz)]).toBeNull();
    for (const hz of EXPRESS_FREQUENCIES_HZ) expect(l.left.uncertaintyDb[idx(hz)]).toBe(4.5);
    const at3k = l.left.lossDb[idx(3000)] as number;
    expect(at3k).toBeGreaterThan(10);
    expect(at3k).toBeLessThan(30);
    expect(l.left.lossDb[idx(250)]).toBe(0);
  });

  it('subtracts headphone compensation before computing loss', () => {
    const t = tracks({ left: [0, 0, 10, 20, 30], right: [0, 0, 10, 20, 30] });
    const zeros = BAND_FREQUENCIES_HZ.map(() => 0);
    const same = computeLoss(t, { left: zeros, right: zeros });
    expect(same).toEqual(computeLoss(t));
    // Headphones 6 dB quiet at 4 kHz in the left ear: thresholds there read 6 dB too high.
    const comp = BAND_FREQUENCIES_HZ.map((hz) => (hz === 4000 ? 6 : 0));
    const corrected = computeLoss(t, { left: comp, right: zeros });
    expect(corrected.left.lossDb[idx(4000)]).toBeCloseTo(14, 10);
    expect(corrected.right.lossDb[idx(4000)]).toBeCloseTo(20, 10);
    // Compensation at 1 kHz moves the reference too.
    const ref = BAND_FREQUENCIES_HZ.map((hz) => (hz === 1000 ? 3 : 0));
    const shifted = computeLoss(t, { left: ref, right: ref });
    expect(shifted.left.lossDb[idx(4000)]).toBeCloseTo(23, 10);
  });
});

describe('reliability', () => {
  // [n catch trials, false alarms, SDs, expected]
  const wide = (k: number): number[] => [
    ...Array<number>(k).fill(9),
    ...Array<number>(10 - k).fill(4),
  ];
  const cases: [number, number, number[], Reliability][] = [
    // n = 6: High allows 1 false alarm, Medium 2.
    [6, 0, wide(0), 'High'],
    [6, 1, wide(0), 'High'],
    [6, 2, wide(0), 'Medium'],
    [6, 3, wide(0), 'Low'],
    [6, 0, [...Array<number>(9).fill(4), 6], 'High'],
    [6, 0, [...Array<number>(9).fill(4), 6.1], 'Medium'],
    [6, 0, wide(2), 'Medium'],
    [6, 0, wide(3), 'Low'],
    [6, 2, wide(2), 'Medium'],
    // n = 8: floor(1.2) = 1 for High, floor(2.4) = 2 for Medium.
    [8, 1, wide(0), 'High'],
    [8, 2, wide(0), 'Medium'],
    [8, 3, wide(0), 'Low'],
    // n = 12: floor(1.8) = 1 for High, floor(3.6) = 3 for Medium.
    [12, 1, wide(0), 'High'],
    [12, 2, wide(0), 'Medium'],
    [12, 3, wide(0), 'Medium'],
    [12, 4, wide(0), 'Low'],
    [12, 3, wide(3), 'Low'],
  ];
  it.each(cases)('n=%i, fa=%i -> %s', (n, fa, sds, expected) => {
    expect(rateReliability({ catchTrials: n, falseAlarms: fa, trackSdsDb: sds })).toBe(expected);
  });
});

describe('referral flags', () => {
  const flat = (v: number): number[] => BAND_FREQUENCIES_HZ.map(() => v);
  it('returns nothing for symmetric mild loss', () => {
    expect(referralReasons({ left: flat(15), right: flat(18) })).toEqual([]);
  });
  it('flags average asymmetry over 20 dB', () => {
    const r = referralReasons({ left: flat(5), right: flat(26) });
    expect(r.map((x) => x.code)).toContain('average-asymmetry');
    expect(referralReasons({ left: flat(5), right: flat(25) })).toEqual([]);
  });
  it('flags a single band differing by more than 30 dB', () => {
    const right = flat(0);
    right[idx(4000)] = 31;
    expect(referralReasons({ left: flat(0), right })).toEqual([
      { code: 'band-asymmetry', hz: 4000, differenceDb: 31 },
    ]);
  });
  it('flags average loss over 40 dB per ear', () => {
    const r = referralReasons({ left: flat(41), right: flat(41) });
    expect(r.filter((x) => x.code === 'average-loss')).toHaveLength(2);
  });
});

describe('audiograms', () => {
  it('builds a valid audiogram from a session result', () => {
    const result: SessionResult = {
      method: 'express',
      lcDbfs: LC,
      tracks: tracks({ left: [0, 0, 10, 20, 30], right: [0, 0, 10, 20, 30] }),
      catchHistory: { catchTrials: 6, falseAlarms: 0 },
      guessRate: 0.02,
      totalTrials: 36,
      toneTrials: 30,
      catchTrials: 6,
      heardToneTrials: 15,
    };
    const a = audiogramFromSession(result, '2026-11-09T10:00:00.000Z');
    expect(migrate(AUDIOGRAM, a)).toEqual(a);
    expect(a.reliability).toBe('High');
    expect(a.ears.left.thresholds[idx(3000)]).toBeNull();
    expect(a.ears.left.thresholds[idx(4000)]?.relLc).toBeCloseTo(-75 - 5 + 20 + 30, 10);
  });

  it('builds a starter audiogram with nothing measured', () => {
    const a = starterAudiogram('70-79', '2026-11-09T10:00:00.000Z');
    expect(migrate(AUDIOGRAM, a)).toEqual(a);
    expect(a.reliability).toBeNull();
    expect(a.ears.left.uncertaintyDb.every((u) => u === null)).toBe(true);
    expect(a.ears.left.lossDb[idx(4000)]).toBe(30);
  });
});
