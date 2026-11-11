// Safety tests (M02 section 6). Each guards a RULES.md safety rule.

import { call, expect, test } from './harness.ts';

interface Topology {
  nodes: { id: number; role: string; label: string }[];
  edges: { from: number; to: number }[];
}

const MODES = ['enhanced', 'original', 'simulate'] as const;

test.describe('topology', () => {
  for (const mode of MODES) {
    test(`the Safety limiter is the only node feeding the destination (${mode})`, async ({
      harness,
    }) => {
      const t = await call<Topology>(harness, 'topology', mode);
      const role = (id: number) => t.nodes.find((n) => n.id === id)?.role;
      const safety = t.nodes.filter((n) => n.role === 'safetyLimiter');
      expect(safety).toHaveLength(1);
      const dest = t.nodes.find((n) => n.role === 'destination');
      expect(dest).toBeDefined();
      const intoDest = t.edges.filter((e) => e.to === dest?.id).map((e) => role(e.from));
      expect(intoDest).toEqual(['safetyLimiter']);
      // The Safety limiter feeds only the destination and the taps, and the taps feed nothing.
      const fromSafety = t.edges.filter((e) => e.from === safety[0]?.id).map((e) => role(e.to));
      expect(fromSafety.sort()).toEqual(['analyser', 'destination', 'outputMonitor']);
      for (const tap of t.nodes.filter(
        (n) => n.role === 'analyser' || n.role === 'outputMonitor',
      )) {
        expect(t.edges.filter((e) => e.from === tap.id)).toEqual([]);
      }
      // Both the wet and the dry path reach the sum, and the sum reaches the Safety limiter.
      const into = (r: string) => t.edges.filter((e) => role(e.to) === r).map((e) => role(e.from));
      expect(into('sum').sort()).toEqual(['dryGain', 'wetGain']);
      expect(into('master')).toEqual(['sum']);
      expect(into('safetyLimiter')).toEqual(['master']);
    });
  }

  test('the graph cannot be built without the Safety limiter', async ({ harness }) => {
    const r = await call<{ rejected: boolean; message: string }>(harness, 'buildWithoutWorklet');
    expect(r.rejected).toBe(true);
  });
});

test.describe('peaks: master output never exceeds -3 dBFS', () => {
  const signals = ['square', 'squareLow', 'clippedSweep', 'impulses', 'boostedNoise'] as const;
  for (const mode of MODES) {
    for (const signal of signals) {
      test(`${signal} in ${mode} with +24 dB boosts`, async ({ harness }) => {
        const r = await call<{ samplePeakDb: number; truePeakDb: number }>(
          harness,
          'peaks',
          signal,
          mode,
          'severe',
          -6,
        );
        expect(r.samplePeakDb).toBeLessThanOrEqual(-3 + 0.1);
        expect(r.truePeakDb).toBeLessThanOrEqual(-2.5);
      });
    }
  }
});

test.describe('Loudest-sound limit is a ceiling on the Enhanced path', () => {
  for (const ceiling of [-24, -12, -6]) {
    for (const signal of ['square', 'boostedNoise', 'clippedSweep'] as const) {
      test(`${signal} at ${ceiling} dBFS`, async ({ harness }) => {
        // In Enhanced the dry gain is 0, so the output is the wet path (the -3 dBFS Safety
        // limiter does not act below it).
        const r = await call<{ samplePeakDb: number; truePeakDb: number }>(
          harness,
          'peaks',
          signal,
          'enhanced',
          'severe',
          ceiling,
        );
        expect(r.samplePeakDb).toBeLessThanOrEqual(ceiling + 0.1);
        expect(r.truePeakDb).toBeLessThanOrEqual(ceiling + 0.5);
      });
    }
  }
});

test('boost clamp: no band exceeds +24 dB in total', async ({ harness }) => {
  const r = await call<{ planPeaks: number[]; measuredPeakDb: number }>(harness, 'boostClamp');
  for (const p of r.planPeaks) expect(p).toBeLessThanOrEqual(24 + 1e-6);
  // Measured through the real graph (transfer function against a flat render).
  expect(r.measuredPeakDb).toBeLessThanOrEqual(24.1);
  expect(r.measuredPeakDb).toBeGreaterThan(20);
});

test.describe('null test: the dry-path delay matches the wet path', () => {
  for (const blend of [0.25, 0.5, 0.75]) {
    test(`${blend * 100}% Original/Enhanced crossfade has no comb notch deeper than 1 dB`, async ({
      harness,
    }) => {
      const r = await call<{ deepestNotchDb: number; highestBumpDb: number }>(
        harness,
        'nullTest',
        blend,
      );
      expect(r.deepestNotchDb).toBeLessThan(1);
      expect(r.highestBumpDb).toBeLessThan(1);
    });
  }

  test('measured latency equals the declared latencySamples in both modes', async ({ harness }) => {
    const r = await call<{
      budget: { total: number; wet: number };
      delays: Record<string, number>;
    }>(harness, 'latencyInfo');
    expect(r.delays['original']).toBe(r.budget.total);
    expect(r.delays['enhanced']).toBe(r.budget.total);
  });
});

test.describe('overload guard', () => {
  test('fires on a forced overload (offline render)', async ({ harness }) => {
    const r = await call<{ overloads: number }>(harness, 'overloadOffline', true);
    expect(r.overloads).toBe(1);
  });

  test('does not fire on normal programme (offline render)', async ({ harness }) => {
    const r = await call<{ overloads: number }>(harness, 'overloadOffline', false);
    expect(r.overloads).toBe(0);
  });

  test('fades a live overload to silence after about 200 ms', async ({ harness }) => {
    const r = await call<{ firedAfterS: number; afterDb: number; overloaded: boolean }>(
      harness,
      'overloadRealtime',
    );
    expect(r.firedAfterS).toBeGreaterThan(0.19);
    expect(r.firedAfterS).toBeLessThan(0.5);
    expect(r.afterDb).toBeLessThan(-90);
  });

  test('does not fire on normal programme in real time, and meters report', async ({ harness }) => {
    const r = await call<{ overloads: number; levels: number }>(harness, 'normalRealtime', 3);
    expect(r.overloads).toBe(0);
    expect(r.levels).toBeGreaterThan(20);
  });
});
