import { describe, expect, it } from 'vitest';
import { createRng } from '../rng.ts';
import { levelFrame, thresholdGridDbfs } from './levels.ts';
import { EXPRESS_PARAMS } from './params.ts';
import { HearingCheckSession, estimateGuessRate, priorMeanDbfs } from './session.ts';
import { Track, edgeFlags, pHeard } from './track.ts';
import type { Trial } from './types.ts';

/** Checked index: fails the test instead of returning undefined. */
function at<T>(items: ArrayLike<T>, i: number): T {
  const v = items[i];
  if (v === undefined) throw new Error(`no item at ${i}`);
  return v;
}

function run(
  seed: number,
  respond: (t: Trial) => boolean,
  method: 'express' | 'refine' = 'express',
  lcDbfs = -30,
) {
  const s = new HearingCheckSession({ method, lcDbfs, ageRange: '60-69', rng: createRng(seed) });
  const trials: Trial[] = [];
  for (let t = s.next(); t; t = s.next()) {
    expect(s.next()).toBe(t); // stable until answered
    trials.push(t);
    s.respond(respond(t));
  }
  return { trials, result: s.result(), session: s };
}

/** A deterministic listener whose threshold is the prior mean + offset. */
function ideal(offsetDb: number, lcDbfs = -30) {
  return (t: Trial): boolean => {
    if (t.kind === 'catch') return false;
    return t.levelDbfs >= priorMeanDbfs(lcDbfs, '60-69', t.hz as 1000) + offsetDb;
  };
}

describe('levels', () => {
  it('ceiling is min(Lc + 12, -6) and the grid spans floor to ceiling + 10', () => {
    expect(levelFrame(-30).ceilingDbfs).toBe(-18);
    expect(levelFrame(-12).ceilingDbfs).toBe(-6);
    const f = levelFrame(-40);
    const g = thresholdGridDbfs(f);
    expect(g[0]).toBe(-100);
    expect(g[g.length - 1]).toBe(-18);
    expect(at(g, 1) - at(g, 0)).toBe(1);
    expect(thresholdGridDbfs(levelFrame(-20))[0]).toBe(-90);
  });

  it('rejects an Lc above -12 dBFS', () => {
    expect(() => levelFrame(-11)).toThrow(RangeError);
  });
});

describe('psychometric function', () => {
  it('runs from the guess rate to 1 - lapse', () => {
    expect(pHeard(-200, 0, 0.02)).toBeCloseTo(0.02, 6);
    expect(pHeard(200, 0, 0.02)).toBeCloseTo(0.96, 6);
    expect(pHeard(0, 0, 0.02)).toBeCloseTo(0.02 + 0.94 / 2, 6);
  });
});

describe('guess rate', () => {
  it('is the Beta(1, 49) posterior mean, clamped', () => {
    expect(estimateGuessRate({ catchTrials: 0, falseAlarms: 0 })).toBeCloseTo(0.02, 10);
    expect(estimateGuessRate({ catchTrials: 6, falseAlarms: 1 })).toBeCloseTo(2 / 56, 10);
    expect(estimateGuessRate({ catchTrials: 6, falseAlarms: 6 })).toBeCloseTo(7 / 56, 10);
    expect(estimateGuessRate({ catchTrials: 10, falseAlarms: 10 })).toBe(0.15);
    expect(estimateGuessRate({ catchTrials: 200, falseAlarms: 0 })).toBe(0.01);
  });

  it('re-weights posteriors when it changes', () => {
    const frame = levelFrame(-30);
    const t = new Track('x', 'left', 1000, frame, thresholdGridDbfs(frame), -75, 15);
    t.addTrial({ levelDbfs: -90, heard: true }, 0.02);
    const before = t.summary().meanDbfs;
    t.reweight(0.15);
    // A "heard" at a very quiet level is more likely a guess when guessing is common, so the
    // estimate moves less far down.
    expect(t.summary().meanDbfs).toBeGreaterThan(before);
  });
});

describe('Express session', () => {
  it('has ten tracks, never repeats a track back to back, and respects trial limits', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { trials, result } = run(seed, ideal(0));
      expect(result.tracks).toHaveLength(10);
      for (let i = 1; i < trials.length; i++) {
        const p = at(trials, i - 1);
        const c = at(trials, i);
        if (p.kind === 'tone' && c.kind === 'tone' && p.trackId === c.trackId) {
          // Allowed only when that track was the last one open.
          const later = trials.slice(i).filter((t) => t.kind === 'tone' && t.trackId !== c.trackId);
          expect(later).toHaveLength(0);
        }
      }
      for (const t of result.tracks) {
        expect(t.trials).toBeGreaterThanOrEqual(EXPRESS_PARAMS.minTrials);
        expect(t.trials).toBeLessThanOrEqual(EXPRESS_PARAMS.maxTrials);
      }
    }
  });

  it('places catch trials correctly: never first, never two in a row, enough of them', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { trials, result } = run(seed, ideal(5));
      expect(at(trials, 0).kind).toBe('tone');
      for (let i = 1; i < trials.length; i++) {
        expect(at(trials, i - 1).kind === 'catch' && at(trials, i).kind === 'catch').toBe(false);
      }
      const catches = trials.filter((t) => t.kind === 'catch').length;
      expect(catches).toBe(result.catchTrials);
      expect(catches).toBeGreaterThanOrEqual(Math.max(6, Math.floor(result.toneTrials / 5)));
    }
  });

  it('catch trials never change thresholds', () => {
    // The guess rate is only re-estimated from the third catch trial on. Up to then, answering
    // "heard" or "not heard" to catch trials must leave every presented level unchanged: the
    // next level comes from the posterior, so any threshold update would show up here.
    const heardOnCatch = run(9, (t) => (t.kind === 'catch' ? true : ideal(0)(t))).trials;
    const silentOnCatch = run(9, (t) => (t.kind === 'catch' ? false : ideal(0)(t))).trials;
    let catches = 0;
    let i = 0;
    while (i < heardOnCatch.length && catches < 3) {
      expect(heardOnCatch[i]).toEqual(silentOnCatch[i]);
      if (at(heardOnCatch, i).kind === 'catch') catches++;
      i++;
    }
    expect(catches).toBe(3);
  });

  it('a false alarm raises the guess rate and is counted', () => {
    const { result } = run(11, (t) => (t.kind === 'catch' ? true : ideal(0)(t)));
    expect(result.catchHistory.falseAlarms).toBe(result.catchTrials);
    expect(result.guessRate).toBeGreaterThan(0.02);
  });

  it('presents levels on a 0.5 dB grid inside [-90, ceiling]', () => {
    const { trials, session } = run(5, ideal(-40), 'express', -45);
    for (const t of trials) {
      if (t.kind !== 'tone') continue;
      expect(t.levelDbfs).toBeGreaterThanOrEqual(-90);
      expect(t.levelDbfs).toBeLessThanOrEqual(session.frame.ceilingDbfs);
      expect(Number.isInteger(t.levelDbfs * 2)).toBe(true);
      expect(t.levelRelLc).toBeCloseTo(t.levelDbfs + 45, 10);
    }
  });

  it('finds an ideal listener within a few dB and reports both units', () => {
    const { result } = run(3, ideal(8));
    for (const t of result.tracks) {
      const truth = priorMeanDbfs(-30, '60-69', t.hz as 1000) + 8;
      expect(Math.abs(t.thresholdDbfs - truth)).toBeLessThan(8);
      expect(t.thresholdRelLc).toBeCloseTo(t.thresholdDbfs + 30, 10);
    }
  });

  it('when nothing is heard, every estimate lies above every level presented', () => {
    // KNOWN LIMITATION (docs/STATUS.txt): with at most 4 trials a track can climb only about
    // 25 to 30 dB from its prior, so not every track reaches the ceiling flag in Express.
    const { trials, result } = run(4, () => false);
    for (const t of result.tracks) {
      const levels = trials.flatMap((x) =>
        x.kind === 'tone' && x.trackId === t.trackId ? [x.levelDbfs] : [],
      );
      expect(t.thresholdDbfs).toBeGreaterThan(Math.max(...levels));
    }
  });

  it('raises the ceiling flag once "not heard" at the loudest level is established', () => {
    const frame = levelFrame(-30);
    const t = new Track('x', 'left', 1000, frame, thresholdGridDbfs(frame), -30, 13.5);
    for (let i = 0; i < 6; i++) t.addTrial({ levelDbfs: frame.ceilingDbfs, heard: false }, 0.02);
    expect(edgeFlags(t.summary()).noResponseAtLoudest).toBe(true);
    expect(edgeFlags(t.summary()).heardAtQuietest).toBe(false);
  });

  it('flags "heard at the quietest level" when everything is heard', () => {
    const { result } = run(4, (t) => t.kind === 'tone', 'express', -24);
    expect(result.tracks.some((t) => t.heardAtQuietest)).toBe(true);
    expect(result.tracks.every((t) => !t.noResponseAtLoudest)).toBe(true);
  });

  it('is deterministic for a seed', () => {
    expect(run(21, ideal(3)).trials).toEqual(run(21, ideal(3)).trials);
  });
});

describe('information sharing', () => {
  it('shifts a later track towards what neighbours found', () => {
    // A listener 20 dB worse than the prior everywhere: later tracks start closer to the truth,
    // so their first presented level is higher than the bare prior mean.
    const { trials } = run(13, ideal(20));
    const tones = trials.filter((t): t is Extract<Trial, { kind: 'tone' }> => t.kind === 'tone');
    const seen = new Set<string>();
    const firsts = tones.filter((t) => (seen.has(t.trackId) ? false : (seen.add(t.trackId), true)));
    const last = at(firsts, firsts.length - 1);
    expect(last.levelDbfs - priorMeanDbfs(-30, '60-69', last.hz as 1000)).toBeGreaterThan(5);
  });
});

describe('Refine session', () => {
  it('runs 16 tracks seeded from Express and carries the catch history', () => {
    const express = run(17, ideal(4)).result;
    const s = new HearingCheckSession({
      method: 'refine',
      lcDbfs: -30,
      ageRange: '60-69',
      rng: createRng(18),
      seed: express,
    });
    for (let t = s.next(); t; t = s.next()) s.respond(ideal(4)(t));
    const r = s.result();
    expect(r.tracks).toHaveLength(16);
    expect(r.catchTrials).toBeGreaterThanOrEqual(8);
    expect(r.catchHistory.catchTrials).toBe(express.catchTrials + r.catchTrials);
    for (const t of r.tracks) {
      expect(t.trials).toBeLessThanOrEqual(8);
      if (t.trials < 8) expect(t.sdDb).toBeLessThanOrEqual(3.5);
    }
  });

  it('needs an Express result', () => {
    expect(
      () =>
        new HearingCheckSession({
          method: 'refine',
          lcDbfs: -30,
          ageRange: null,
          rng: createRng(1),
        }),
    ).toThrow();
  });
});
