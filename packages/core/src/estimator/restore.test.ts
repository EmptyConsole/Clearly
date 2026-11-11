import { describe, expect, it } from 'vitest';
import { createRng } from '../rng.ts';
import { deterministicListener } from '../testing.ts';
import { HearingCheckSession, restoreSession, type SessionConfig } from './session.ts';
import { isProgressExpired } from '../schemas/records.ts';

const listener = deterministicListener({
  lossDb: { left: [0, 0, 0, 5, 10, 20, 30, 40], right: [0, 0, 0, 5, 10, 20, 30, 40] },
});

function runExpress() {
  const s = new HearingCheckSession({
    method: 'express',
    lcDbfs: -30,
    ageRange: '60-69',
    rng: createRng(1),
  });
  for (let t = s.next(); t; t = s.next()) s.respond(listener.hears(t));
  return s.result();
}

describe('restoreSession and progress', () => {
  it('reports finished tracks over total tracks', () => {
    const s = new HearingCheckSession({
      method: 'express',
      lcDbfs: -30,
      ageRange: null,
      rng: createRng(3),
    });
    expect(s.progress()).toEqual({ finished: 0, total: 10 });
    for (let t = s.next(); t; t = s.next()) s.respond(listener.hears(t));
    expect(s.progress()).toEqual({ finished: 10, total: 10 });
    expect(s.finishedTracks()).toHaveLength(10);
  });

  it('replays stored answers to the same paused state and the same final result', () => {
    const seed = runExpress();
    const config = (): SessionConfig => ({
      method: 'refine',
      lcDbfs: -30,
      ageRange: '60-69',
      rng: createRng(99),
      seed,
    });
    const full = new HearingCheckSession(config());
    const answers: boolean[] = [];
    for (let t = full.next(); t; t = full.next()) {
      const heard = listener.hears(t);
      answers.push(heard);
      full.respond(heard);
    }
    const half = Math.floor(answers.length / 2);
    const resumed = restoreSession(config(), answers.slice(0, half));
    expect(resumed.progress().total).toBe(16);
    for (let t = resumed.next(); t; t = resumed.next()) resumed.respond(listener.hears(t));
    expect(resumed.result()).toEqual(full.result());
  });

  it('rejects answers that run past the end', () => {
    const seed = runExpress();
    expect(() =>
      restoreSession(
        { method: 'refine', lcDbfs: -30, ageRange: null, rng: createRng(1), seed },
        Array.from({ length: 500 }, () => true),
      ),
    ).toThrow();
  });

  it('expires paused progress after its expiry time', () => {
    const p = { expiresAt: '2026-11-10T10:00:00.000Z' };
    expect(isProgressExpired(p, new Date('2026-11-10T09:59:59.000Z'))).toBe(false);
    expect(isProgressExpired(p, new Date('2026-11-10T10:00:00.000Z'))).toBe(true);
  });
});
