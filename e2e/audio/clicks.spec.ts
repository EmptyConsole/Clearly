// Click-free control changes (M02 section 5): a 20 s programme-like signal rendered offline while
// every control is automated through the live update path, checked by the discontinuity detector.

import { call, expect, test } from './harness.ts';

interface Click {
  sample: number;
  channel: number;
  timeS: number;
  severity: number;
}

test('automating every control produces no discontinuities', async ({ harness }) => {
  test.setTimeout(60_000);
  const r = await call<{ inputClicks: Click[]; outputClicks: Click[]; outputPeakDb: number }>(
    harness,
    'clickTest',
  );
  expect(r.inputClicks).toEqual([]);
  expect(r.outputClicks).toEqual([]);
  expect(r.outputPeakDb).toBeLessThanOrEqual(-3 + 0.1);
});

test('the detector finds faults injected into a processed render (positive control)', async ({
  harness,
}) => {
  const r = await call<{ steps: Record<string, boolean>; clicks: Record<string, boolean> }>(
    harness,
    'clickSensitivity',
  );
  // Measured sensitivity on processed programme (output peak -12 dBFS): instantaneous gain steps
  // of 3 dB and up, and clicks of -26 dBFS and up. Any control applied without smoothing (preset,
  // mode, a 24 dB EQ jump) steps the level by more than that.
  expect(r.steps['3']).toBe(true);
  expect(r.steps['6']).toBe(true);
  expect(r.clicks['-26']).toBe(true);
  expect(r.clicks['-20']).toBe(true);
});

test('clean renders stay well under the detection threshold', async ({ harness }) => {
  const r = await call<{ clean: number[]; inputWorst: number }>(harness, 'clickSeverities');
  for (const s of r.clean) expect(s).toBeLessThan(5);
  expect(r.inputWorst).toBeLessThan(5);
});
