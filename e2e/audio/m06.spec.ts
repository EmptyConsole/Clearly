// M06: Night mode and Background cleanup, rendered through the real graph in Chromium.
import { readFileSync, existsSync } from 'node:fs';
import { call, expect, test } from './harness.ts';

const wasm = new URL('../../apps/web/public/heavy/rnnoise/rnnoise.wasm', import.meta.url);
const b64 = existsSync(wasm) ? readFileSync(wasm).toString('base64') : '';

interface Range {
  inputRangeDb: number;
  outputRangeDb: number;
  peakDbfs: number;
  truePeakDbfs: number;
  nightMode: boolean;
}

test('Night mode shrinks a 30 dB swing more at each level and stays inside the safety limits', async ({
  harness,
}) => {
  test.setTimeout(120_000);
  const off = await call<Range>(harness, 'nightRange', 'off');
  const low = await call<Range>(harness, 'nightRange', 'low');
  const medium = await call<Range>(harness, 'nightRange', 'medium');
  const high = await call<Range>(harness, 'nightRange', 'high');
  expect(off.inputRangeDb).toBeGreaterThan(29);
  expect(low.nightMode).toBe(true);
  const shrink = (r: Range) => off.outputRangeDb - r.outputRangeDb;
  // The rider can add up to 6/9/12 dB and cut 12/12/15 dB; in 4 s of each passage it moves at
  // most 12 dB up and 24 dB down. Expect at least 6, 9 and 12 dB less range than without.
  expect(shrink(low)).toBeGreaterThanOrEqual(6);
  expect(shrink(medium)).toBeGreaterThanOrEqual(9);
  expect(shrink(high)).toBeGreaterThanOrEqual(12);
  expect(shrink(medium)).toBeGreaterThan(shrink(low));
  expect(shrink(high)).toBeGreaterThan(shrink(medium));
  for (const r of [low, medium, high]) {
    expect(r.peakDbfs).toBeLessThanOrEqual(-3 + 0.1);
    expect(r.truePeakDbfs).toBeLessThanOrEqual(-2.5);
  }
});

test('switching Night mode levels during playback makes no clicks', async ({ harness }) => {
  test.setTimeout(120_000);
  const r = await call<{ output: number; input: number }>(harness, 'nightToggleClicks');
  expect(r.input).toBe(0);
  expect(r.output).toBe(0);
});

test.describe('Background cleanup', () => {
  test.skip(!b64, 'run pnpm fetch:heavy first');

  test('keeps the declared latency, nulls at 0 percent and reduces noise by 10 dB or more', async ({
    harness,
  }) => {
    test.setTimeout(120_000);
    const r = await call<{
      impulseAt: number;
      expectedAt: number;
      budgetTotal: number;
      latencySamples: number;
      nullMaxErr: number;
      reductionDb: number;
      windows: number;
      ready: boolean;
    }>(harness, 'cleanupGraph', b64);
    expect(r.latencySamples).toBe(r.budgetTotal);
    expect(r.impulseAt).toBe(r.expectedAt);
    expect(r.nullMaxErr).toBeLessThan(1e-5);
    expect(r.ready).toBe(true);
    expect(r.windows).toBeGreaterThan(3);
    expect(r.reductionDb).toBeGreaterThanOrEqual(10);
  });

  test('worklets stay under 15 percent of a quantum with cleanup, Night Strong and Voice focus', async ({
    harness,
  }) => {
    test.setTimeout(60_000);
    const r = await call<{
      overloads: number;
      vadMessages: number;
      perf: { node: string; report: { meanMs: number; quantumMs: number } }[];
    }>(harness, 'perfAllOn', b64);
    const quantum = r.perf[0]?.report.quantumMs ?? 128 / 48;
    const sum = r.perf.reduce((a, p) => a + p.report.meanMs, 0);
    console.log(
      `M06 worklet sum ${(sum * 1000).toFixed(1)} us = ${((sum / quantum) * 100).toFixed(2)}%`,
    );
    for (const p of r.perf) console.log(`  ${p.node}: ${(p.report.meanMs * 1000).toFixed(1)} us`);
    expect(r.overloads).toBe(0);
    expect(r.vadMessages).toBeGreaterThan(5);
    expect(sum / quantum).toBeLessThan(0.15);
  });
});
