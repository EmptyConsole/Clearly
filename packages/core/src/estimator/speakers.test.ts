import { describe, expect, it } from 'vitest';
import { createRng } from '../rng.ts';
import { deterministicListener } from '../testing.ts';
import { expectedDurationSeconds } from '../timing.ts';
import { HearingCheckSession, mirrorEars } from './session.ts';

// A check through computer speakers: both ears together, one set of tracks.
const listener = deterministicListener({
  lossDb: { left: [0, 0, 0, 5, 10, 20, 30, 40], right: [0, 0, 0, 5, 10, 20, 30, 40] },
});

function run(ears?: readonly ('left' | 'right')[]) {
  const s = new HearingCheckSession({
    method: 'express',
    lcDbfs: -30,
    ageRange: '60-69',
    rng: createRng(5),
    ...(ears ? { ears } : {}),
  });
  const total = s.progress().total;
  let trials = 0;
  for (let t = s.next(); t; t = s.next()) {
    trials += 1;
    s.respond(listener.hears(t));
  }
  return { result: s.result(), total, trials };
}

describe('Hearing Check through computer speakers', () => {
  it('runs one set of tracks (half the tones) when only one ear is asked for', () => {
    const both = run();
    const one = run(['left']);
    expect(both.total).toBe(10);
    expect(one.total).toBe(5);
    expect(one.result.tracks.every((t) => t.ear === 'left')).toBe(true);
    expect(one.result.toneTrials).toBeLessThan(both.result.toneTrials);
  });

  it('mirrorEars copies the result to both ears, and leaves a two-ear result alone', () => {
    const { result } = run(['left']);
    const m = mirrorEars(result);
    expect(m.tracks).toHaveLength(10);
    for (const r of m.tracks.filter((t) => t.ear === 'right')) {
      const l = m.tracks.find((t) => t.ear === 'left' && t.hz === r.hz);
      expect(r.trackId).toBe(`right-${String(r.hz)}`);
      expect(r.thresholdDbfs).toBe(l?.thresholdDbfs);
    }
    const two = run().result;
    expect(mirrorEars(two)).toBe(two);
  });

  it('a speakers check takes less time than a headphones check', () => {
    expect(expectedDurationSeconds('express', 'normal', 1)).toBeLessThan(
      expectedDurationSeconds('express', 'normal'),
    );
    expect(expectedDurationSeconds('starter', 'normal', 1)).toBe(
      expectedDurationSeconds('starter', 'normal'),
    );
  });
});
