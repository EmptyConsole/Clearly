// Encoders (M02 section 4): render through renderOffline into a worker encoder, decode the result
// with decodeAudioData and compare.

import { call, expect, test } from './harness.ts';

interface RoundTrip {
  bytes: number;
  type: string;
  inputDurationS: number;
  decodedDurationS: number;
  decodedRate: number;
  channels: number;
  inputRmsDb: number;
  decodedRmsDb: number;
}

function check(r: RoundTrip) {
  expect(Math.abs(r.decodedDurationS - r.inputDurationS)).toBeLessThanOrEqual(0.05);
  expect(Math.abs(r.decodedRmsDb - r.inputRmsDb)).toBeLessThanOrEqual(0.5);
  expect(r.channels).toBe(2);
}

test('WAV: 16-bit PCM decodes back with the same length and level', async ({ harness }) => {
  const r = await call<RoundTrip>(harness, 'encodeRoundTrip', 'wav');
  check(r);
  expect(r.type).toBe('audio/wav');
  expect(r.bytes).toBe(44 + 10 * 48000 * 4);
  expect(r.decodedDurationS).toBe(10);
});

for (const kbps of [128, 192, 256, 320] as const) {
  test(`MP3 ${kbps} kbps decodes back with the same length and level`, async ({ harness }) => {
    const r = await call<RoundTrip>(harness, 'encodeRoundTrip', 'mp3', kbps);
    check(r);
    expect(r.type).toBe('audio/mpeg');
    // Constant bitrate: size within 5 percent of bitrate x duration.
    expect(Math.abs(r.bytes / ((kbps * 1000 * 10) / 8) - 1)).toBeLessThan(0.05);
  });
}

test('WAV refuses a recording over the 4 GB RIFF limit', async ({ harness }) => {
  const r = await call<{ refused: boolean; name: string }>(harness, 'wavLimit');
  expect(r).toEqual({ refused: true, name: 'WavLimitError' });
});
