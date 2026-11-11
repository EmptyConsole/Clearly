// M09: Hum Filter rendered through the real graph in Chromium.
import { call, expect, test } from './harness.ts';

interface Removal {
  detectedF0: number | null;
  harmonics: number[];
  humReductionDb: number;
  speechBandChangeDb: number;
}

for (const f0 of [49.5, 50.5, 59.5, 60.5]) {
  test(`Hum Filter detects ${f0} Hz hum under speech and removes it by 25 dB or more`, async ({
    harness,
  }) => {
    test.setTimeout(120_000);
    const r = await call<Removal>(harness, 'humRemoval', f0);
    expect(r.detectedF0).not.toBeNull();
    expect(Math.abs((r.detectedF0 ?? 0) - f0)).toBeLessThan(0.2);
    expect(r.humReductionDb).toBeGreaterThanOrEqual(25);
    expect(Math.abs(r.speechBandChangeDb)).toBeLessThan(1);
  });
}

test('switching Hum Filter modes makes no clicks', async ({ harness }) => {
  test.setTimeout(120_000);
  const r = await call<{ output: number; input: number }>(harness, 'humModeClicks');
  expect(r.input).toBe(0);
  expect(r.output).toBe(0);
});

test('Calm Sounds: the volume cap holds for every generator with a malicious volume', async ({
  harness,
}) => {
  test.setTimeout(120_000);
  const r = await call<Record<string, { rmsDbfs: number; peakDbfs: number; afterSetDbfs: number }>>(
    harness,
    'calmCap',
  );
  for (const [kind, v] of Object.entries(r)) {
    // Long-term RMS at the cap (ocean swells, so its 9 s windows are allowed 1.5 dB).
    const tol = kind === 'ocean' ? 1.5 : 0.5;
    expect(v.rmsDbfs, kind).toBeLessThanOrEqual(-30 + tol);
    expect(v.afterSetDbfs, kind).toBeLessThanOrEqual(-30 + tol);
    expect(v.peakDbfs, kind).toBeLessThanOrEqual(-3 + 0.1);
  }
});

test('Calm Sounds: the sleep fade and a source change make no clicks', async ({ harness }) => {
  test.setTimeout(60_000);
  const r = await call<{ clicks: number; tailPeakDbfs: number }>(harness, 'calmFadeClicks');
  expect(r.clicks).toBe(0);
  expect(r.tailPeakDbfs).toBeLessThan(-90);
});
