// Tone generator (M02 section 2), rendered offline in Chromium.

import { call, expect, test } from './harness.ts';

interface Warble {
  onsetTime: number;
  scheduledTime: number;
  peakDbfsUsed: number;
  carrierHz: number;
  fmMinRatio: number;
  fmMaxRatio: number;
  rampOver: number;
  rampUnder: number;
  samplePeakDb: number;
  otherChannelDb: number;
  beforeOnsetDb: number;
  durationMs: number;
}

const cases = [
  { freqHz: 250, ear: 'left', peakDbfs: -40 },
  { freqHz: 1000, ear: 'right', peakDbfs: -20 },
  { freqHz: 4000, ear: 'left', peakDbfs: -30 },
  { freqHz: 8000, ear: 'right', peakDbfs: -6 },
] as const;

for (const c of cases) {
  test(`warble ${c.freqHz} Hz, ${c.ear} ear, ${c.peakDbfs} dBFS`, async ({ harness }) => {
    const r = await call<Warble>(harness, 'warble', c.freqHz, c.ear, c.peakDbfs);
    // Frequency: the carrier over one full 5 Hz FM period.
    expect(Math.abs(r.carrierHz / c.freqHz - 1)).toBeLessThan(0.001);
    // FM depth +-5 percent (zero-crossing estimates are coarser at 8 kHz: 6 samples per cycle).
    const tol = c.freqHz >= 8000 ? 0.01 : 0.002;
    expect(Math.abs(r.fmMinRatio - 0.95)).toBeLessThan(tol);
    expect(Math.abs(r.fmMaxRatio - 1.05)).toBeLessThan(tol);
    // Peak level within 0.1 dB.
    expect(Math.abs(r.samplePeakDb - c.peakDbfs)).toBeLessThan(0.1);
    // Hard panning: the other channel is silent.
    expect(r.otherChannelDb).toBeLessThan(-100);
    // Nothing before the onset; 350 ms long; onset reported on the audio clock after the Safety
    // limiter's 2 ms lookahead.
    expect(r.beforeOnsetDb).toBeLessThan(-100);
    expect(r.durationMs).toBeCloseTo(350, 0);
    expect(r.onsetTime - r.scheduledTime).toBeCloseTo(0.002, 6);
  });
}

test('the raised-cosine ramp shape is followed (1 kHz)', async ({ harness }) => {
  const r = await call<Warble>(harness, 'warble', 1000, 'left', -20);
  // Never above the raised cosine; within 1 percent below it (sampling of the crest).
  expect(r.rampOver).toBeLessThan(1e-4);
  expect(r.rampUnder).toBeLessThan(0.01);
});

test('the peak is clamped to [-90, -6] dBFS', async ({ harness }) => {
  const loud = await call<Warble>(harness, 'warble', 4000, 'right', 0);
  expect(loud.peakDbfsUsed).toBe(-6);
  expect(Math.abs(loud.samplePeakDb + 6)).toBeLessThan(0.1);
  const quiet = await call<Warble>(harness, 'warble', 1000, 'left', -120);
  expect(quiet.peakDbfsUsed).toBe(-90);
  expect(Math.abs(quiet.samplePeakDb + 90)).toBeLessThan(0.1);
});

test('the calibration ramp rises 1.5 dB per 100 ms from -60 to -12 dBFS in both ears', async ({
  harness,
}) => {
  const r = await call<{
    levels: { expected: number; measured: number; reported: number }[];
    topTime: number;
    channelsEqual: boolean;
    clicks: unknown[];
  }>(harness, 'calibration');
  for (const l of r.levels) {
    expect(Math.abs(l.measured - l.expected)).toBeLessThan(0.1);
    expect(l.reported).toBe(l.expected);
  }
  expect(r.levels.at(-1)?.expected).toBe(-12);
  expect(r.topTime).toBeCloseTo(0.1 + 3.2 + 0.002, 6);
  expect(r.channelsEqual).toBe(true);
  expect(r.clicks).toEqual([]);
});

test('computer speakers: the warble plays in both channels, identical, at the calibrated peak', async ({
  harness,
}) => {
  for (const [hz, peak] of [
    [1000, -20],
    [4000, -35],
  ] as const) {
    const r = await call<{ leftPeakDb: number; rightPeakDb: number; maxDiffDb: number }>(
      harness,
      'warbleBoth',
      hz,
      peak,
    );
    // The same level per channel as one headphone channel gets, so Lc still applies.
    expect(Math.abs(r.leftPeakDb - peak)).toBeLessThan(0.1);
    expect(Math.abs(r.rightPeakDb - peak)).toBeLessThan(0.1);
    expect(r.maxDiffDb).toBeLessThan(-100);
  }
});
