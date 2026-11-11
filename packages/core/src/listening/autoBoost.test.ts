import { describe, expect, it } from 'vitest';
import { resolveSettings } from '../sound/precedence.ts';
import {
  AutoBoostController,
  Backlash,
  boostShare,
  correlation,
  FeedbackGuard,
  RoomLevelSmoother,
  roomThresholds,
} from './autoBoost.ts';

/** Deterministic pseudo-random sequence. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('Auto Boost mapping', () => {
  it('makes no change below -55 dBFS and the full 6 dB at -30 dBFS', () => {
    expect(boostShare(-70, 'medium')).toBe(0);
    expect(boostShare(-55, 'medium')).toBe(0);
    expect(boostShare(-42.5, 'medium')).toBeCloseTo(0.5, 6);
    expect(boostShare(-30, 'medium')).toBe(1);
    expect(boostShare(-10, 'medium')).toBe(1);
  });
  it('sensitivity shifts both thresholds by 5 dB', () => {
    expect(roomThresholds('high')).toEqual({ quiet: -60, loud: -35 });
    expect(roomThresholds('medium')).toEqual({ quiet: -55, loud: -30 });
    expect(roomThresholds('low')).toEqual({ quiet: -50, loud: -25 });
  });
});

describe('RoomLevelSmoother', () => {
  it('rises with a 2 s attack and falls with a 5 s release', () => {
    const s = new RoomLevelSmoother();
    s.update(-60, 0.25);
    let v = -60;
    for (let t = 0; t < 2; t += 0.25) v = s.update(-40, 0.25);
    // After one attack time constant: 63 percent of the 20 dB step.
    expect(v).toBeCloseTo(-60 + 20 * (1 - Math.exp(-1)), 1);
    const s2 = new RoomLevelSmoother();
    s2.update(-40, 0.25);
    for (let t = 0; t < 5; t += 0.25) v = s2.update(-60, 0.25);
    expect(v).toBeCloseTo(-40 - 20 * (1 - Math.exp(-1)), 1);
  });
});

describe('hysteresis', () => {
  it('ignores wobbles within 3 dB', () => {
    const b = new Backlash(3);
    expect(b.update(-45)).toBe(-45);
    for (const x of [-44, -46, -43.6, -46.4, -45]) expect(b.update(x)).toBe(-45);
    expect(b.update(-42)).toBe(-43.5);
  });
  it('a level wobbling by 2 dB does not move the boost', () => {
    const c = new AutoBoostController();
    const out = rng(3);
    const boosts = new Set<string>();
    // Settle at -45 dBFS, then wobble +-1 dB.
    for (let i = 0; i < 200; i++) c.update(-45, -20 - 10 * out(), 0.25);
    for (let i = 0; i < 200; i++) {
      const r = c.update(-45 + (i % 2 ? 1 : -1), -20 - 10 * out(), 0.25);
      boosts.add(r.boostDb.toFixed(3));
    }
    expect(boosts.size).toBe(1);
  });
});

describe('AutoBoostController', () => {
  it('reaches about +2.4 dB at -45 dBFS and +6 dB in a loud room, through the clamp', () => {
    const c = new AutoBoostController();
    const out = rng(1);
    let r = c.update(-45, -20, 0.25);
    for (let i = 0; i < 160; i++) r = c.update(-45, -20 - 10 * out(), 0.25);
    expect(r.boostDb).toBeGreaterThan(2);
    expect(r.boostDb).toBeLessThan(3);
    for (let i = 0; i < 160; i++) r = c.update(-25, -20 - 10 * out(), 0.25);
    expect(r.boostDb).toBe(6);
    expect(r.thresholdDropDb).toBe(6);
    const s = resolveSettings({
      preset: 'movie',
      ambientBoostDb: r.boostDb,
      thresholdDropDb: r.thresholdDropDb,
    });
    expect(s.ambientBoostDb).toBe(6);
    expect(s.compressor.kind === 'normal' && s.compressor.thresholdDbfs).toBe(-30);
  });
  it('precedence clamps the threshold drop to 6 dB and leaves Night mode alone', () => {
    const a = resolveSettings({ preset: 'movie', thresholdDropDb: 40 });
    expect(a.compressor.kind === 'normal' && a.compressor.thresholdDbfs).toBe(-30);
    const n = resolveSettings({ preset: 'night', thresholdDropDb: 6 });
    expect(n.compressor.kind).toBe('night');
  });
});

describe('feedback guard', () => {
  it('trips after 5 s when the microphone hears the programme', () => {
    const g = new FeedbackGuard();
    const r = rng(7);
    let tripped = false;
    let at = 0;
    for (let i = 0; i < 120 && !tripped; i++) {
      const out = -30 + 20 * r();
      // Speakers: the microphone hears the programme 25 dB down plus a little room noise.
      tripped = g.update(out, out - 25 + (r() - 0.5), 0.25);
      at = (i + 1) * 0.25;
    }
    expect(tripped).toBe(true);
    // Half a window to start correlating, then 5 s above 0.6.
    expect(at).toBeGreaterThanOrEqual(10);
    expect(at).toBeLessThanOrEqual(11);
  });
  it('does not trip on an unrelated noisy room', () => {
    const g = new FeedbackGuard();
    const r = rng(9);
    for (let i = 0; i < 400; i++) expect(g.update(-30 + 20 * r(), -45 + 6 * r(), 0.25)).toBe(false);
  });
  it('freezes the boost while paused and resumes on request', () => {
    const c = new AutoBoostController();
    const r = rng(11);
    let last = c.update(-40, -20, 0.25);
    for (let i = 0; i < 80; i++) {
      const out = -30 + 20 * r();
      last = c.update(out - 10, out, 0.25);
    }
    expect(last.paused).toBe(true);
    const frozen = last.boostDb;
    for (let i = 0; i < 20; i++) last = c.update(-20, -25 + 10 * r(), 0.25);
    expect(last.boostDb).toBe(frozen);
    c.resume();
    for (let i = 0; i < 80; i++) last = c.update(-20, -25 + 10 * r(), 0.25);
    expect(last.paused).toBe(false);
    expect(last.boostDb).toBe(6);
  });
  it('correlation is 0 for a flat envelope', () => {
    expect(correlation([1, 1, 1, 1], [1, 2, 3, 4])).toBe(0);
    expect(correlation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 9);
  });
});
