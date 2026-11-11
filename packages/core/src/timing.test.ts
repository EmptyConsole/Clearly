import { describe, expect, it } from 'vitest';
import { createRng } from './rng.ts';
import {
  durationFromStatsSeconds,
  effectivePace,
  expectedDurationSeconds,
  meanTrialMs,
  nextGapMs,
  trialEndAfterOnsetMs,
  trialTimings,
} from './timing.ts';

describe('trial timing', () => {
  it('slower pace multiplies the window and gaps by 1.5, not the cue', () => {
    const n = trialTimings('normal');
    const s = trialTimings('slower');
    expect(s.responseWindowMs).toBe(1500);
    expect(s.afterHeardMs).toBe(450);
    expect([s.gapMinMs, s.gapMaxMs]).toEqual([375, 675]);
    expect(s.cueLeadMs).toBe(n.cueLeadMs);
  });

  it('heard ends 300 ms after the tap; not heard ends at the window', () => {
    expect(trialEndAfterOnsetMs('normal', 400)).toBe(700);
    expect(trialEndAfterOnsetMs('normal', null)).toBe(1000);
    expect(meanTrialMs('normal', false)).toBe(200 + 1000 + 350);
    expect(meanTrialMs('normal', true)).toBe(200 + 450 + 300 + 350);
  });

  it('random gaps stay in 250 to 450 ms', () => {
    const rng = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const g = nextGapMs('normal', rng);
      expect(g).toBeGreaterThanOrEqual(250);
      expect(g).toBeLessThanOrEqual(450);
    }
  });

  it('slower pace turns on automatically for 70 and over', () => {
    expect(effectivePace('auto', '70-79')).toBe('slower');
    expect(effectivePace('auto', '80-plus')).toBe('slower');
    expect(effectivePace('auto', '60-69')).toBe('normal');
    expect(effectivePace('auto', null)).toBe('normal');
    expect(effectivePace('normal', '80-plus')).toBe('normal');
  });
});

describe('expected durations', () => {
  it('starter is a fixed 5 seconds', () => {
    expect(expectedDurationSeconds('starter', 'normal')).toBe(5);
  });

  it('adds 4 s of calibration to the trial time', () => {
    expect(
      durationFromStatsSeconds({ toneTrialsMean: 0, catchTrialsMean: 0, heardShare: 0 }, 'normal'),
    ).toBe(4);
    expect(
      durationFromStatsSeconds({ toneTrialsMean: 10, catchTrialsMean: 0, heardShare: 1 }, 'normal'),
    ).toBeCloseTo(4 + 13, 10);
  });

  it('rounds up to the nearest 10 s, and slower is never shorter', () => {
    for (const m of ['express', 'refine'] as const) {
      const n = expectedDurationSeconds(m, 'normal');
      expect(n % 10).toBe(0);
      expect(expectedDurationSeconds(m, 'slower')).toBeGreaterThanOrEqual(n);
    }
  });
});
