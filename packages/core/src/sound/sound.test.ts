import { describe, expect, it } from 'vitest';
import { BAND_FREQUENCIES_HZ, MAX_BAND_BOOST_DB, SAMPLE_RATE_HZ } from '../constants.ts';
import { createRng, uniform } from '../rng.ts';
import { biquadCoefficients, biquadMagnitudeDb } from './biquad.ts';
import { clampSummedBoost, combinedPeakDb, type BoostContributions } from './boostClamp.ts';
import { bandGainDb, kneeWeight, type GainOptions } from './gain.ts';
import { resolveSettings } from './precedence.ts';
import { PRESETS } from './presets.ts';

const STD: GainOptions = { boostStyle: 'standard', capDb: 18, strength: 1 };

describe('gain', () => {
  it('soft knee: 0 at or below 2 dB, full at or above 8 dB', () => {
    expect(kneeWeight(2)).toBe(0);
    expect(kneeWeight(0)).toBe(0);
    expect(kneeWeight(8)).toBe(1);
    expect(kneeWeight(5)).toBeCloseTo(0.5, 12);
    expect(bandGainDb(2, STD)).toBe(0);
    expect(bandGainDb(20, STD)).toBeCloseTo(10, 12);
  });

  it('boost style sets the ratio and the cap limits it', () => {
    expect(bandGainDb(30, { ...STD, boostStyle: 'gentle' })).toBeCloseTo(9.9, 12);
    expect(bandGainDb(30, { ...STD, boostStyle: 'strong' })).toBeCloseTo(18, 12);
    expect(bandGainDb(60, STD)).toBe(18);
    expect(bandGainDb(60, { ...STD, capDb: 24 })).toBe(24);
    expect(bandGainDb(60, { ...STD, capDb: 40 })).toBe(24); // cap clamped to 12..24
  });

  it('starter profiles are forced to Gentle with a 12 dB cap', () => {
    const opts = { boostStyle: 'strong', capDb: 24, strength: 1, starter: true } as const;
    expect(bandGainDb(30, opts)).toBeCloseTo(9.9, 12);
    expect(bandGainDb(60, opts)).toBe(12);
  });

  it('strength multiplies, then gains are re-capped at 24 dB', () => {
    expect(bandGainDb(20, { ...STD, strength: 1.5 })).toBeCloseTo(15, 12);
    expect(bandGainDb(60, { ...STD, capDb: 24, strength: 1.5 })).toBe(24);
    expect(bandGainDb(60, { ...STD, strength: 0 })).toBe(0);
  });

  it('is continuous: no jump over 0.5 dB for a 0.1 dB change in loss', () => {
    for (const boostStyle of ['gentle', 'standard', 'strong'] as const) {
      for (const strength of [0, 0.5, 1, 1.5]) {
        for (const capDb of [12, 18, 24]) {
          const o = { boostStyle, capDb, strength };
          for (let loss = 0; loss <= 80; loss += 0.1) {
            expect(Math.abs(bandGainDb(loss + 0.1, o) - bandGainDb(loss, o))).toBeLessThanOrEqual(
              0.5,
            );
          }
        }
      }
    }
  });
});

describe('biquad magnitudes (Web Audio formulas)', () => {
  it('peaking reaches its gain at f0 and is flat far away', () => {
    const c = biquadCoefficients(
      { type: 'peaking', frequencyHz: 2000, gainDb: 12, q: 1 },
      SAMPLE_RATE_HZ,
    );
    expect(biquadMagnitudeDb(c, 2000, SAMPLE_RATE_HZ)).toBeCloseTo(12, 6);
    expect(Math.abs(biquadMagnitudeDb(c, 20, SAMPLE_RATE_HZ))).toBeLessThan(0.05);
  });

  it('highshelf reaches its gain at high frequency and half of it at f0', () => {
    const c = biquadCoefficients(
      { type: 'highshelf', frequencyHz: 8000, gainDb: 10, q: 1 },
      SAMPLE_RATE_HZ,
    );
    expect(biquadMagnitudeDb(c, 8000, SAMPLE_RATE_HZ)).toBeCloseTo(5, 6);
    expect(biquadMagnitudeDb(c, 23000, SAMPLE_RATE_HZ)).toBeGreaterThan(9.5);
    expect(Math.abs(biquadMagnitudeDb(c, 100, SAMPLE_RATE_HZ))).toBeLessThan(0.05);
  });
});

describe('summed-boost clamp', () => {
  const zero: BoostContributions = {
    eqDb: BAND_FREQUENCIES_HZ.map(() => 0),
    speechDb: 0,
    voiceFocusDb: 0,
    ambientDb: 0,
  };

  it('leaves safe settings unchanged', () => {
    const c = { ...zero, eqDb: [0, 0, 2, 4, 5, 6, 6, 8], speechDb: 3 };
    expect(combinedPeakDb(c)).toBeLessThan(MAX_BAND_BOOST_DB);
    const r = clampSummedBoost(c);
    expect(r.extrasScale).toBe(1);
    expect(r.eqScale).toBe(1);
    expect(r.eqDb).toEqual(c.eqDb);
  });

  it('reduces the extras before the EQ', () => {
    const c = {
      ...zero,
      eqDb: [0, 0, 3, 6, 8, 9, 6, 6],
      speechDb: 3,
      voiceFocusDb: 6,
      ambientDb: 6,
    };
    expect(combinedPeakDb({ ...c, speechDb: 0, voiceFocusDb: 0, ambientDb: 0 })).toBeLessThan(
      MAX_BAND_BOOST_DB,
    );
    expect(combinedPeakDb(c)).toBeGreaterThan(MAX_BAND_BOOST_DB);
    const r = clampSummedBoost(c);
    expect(r.extrasScale).toBeLessThan(1);
    expect(r.eqScale).toBe(1);
    expect(r.peakDb).toBeLessThanOrEqual(MAX_BAND_BOOST_DB + 1e-9);
  });

  it('scales the EQ when the EQ alone is too much', () => {
    const r = clampSummedBoost({ ...zero, eqDb: BAND_FREQUENCIES_HZ.map(() => 24), speechDb: 3 });
    expect(r.extrasScale).toBe(0);
    expect(r.eqScale).toBeLessThan(1);
    expect(r.peakDb).toBeLessThanOrEqual(MAX_BAND_BOOST_DB + 1e-9);
    expect(r.peakDb).toBeGreaterThan(MAX_BAND_BOOST_DB - 0.01);
  });

  it('property: random inputs always end at or below +24 dB and never grow', () => {
    const rng = createRng(2026);
    for (let i = 0; i < 300; i++) {
      const c: BoostContributions = {
        eqDb: BAND_FREQUENCIES_HZ.map(() => (rng.next() < 0.2 ? 0 : uniform(rng, 0, 24))),
        speechDb: rng.next() < 0.5 ? 0 : 3,
        voiceFocusDb: uniform(rng, 0, 6),
        ambientDb: uniform(rng, 0, 6),
      };
      const r = clampSummedBoost(c);
      expect(r.peakDb).toBeLessThanOrEqual(MAX_BAND_BOOST_DB + 1e-9);
      expect(combinedPeakDb(r)).toBeCloseTo(r.peakDb, 9);
      r.eqDb.forEach((g, j) => {
        expect(g).toBeLessThanOrEqual((c.eqDb[j] as number) + 1e-12);
      });
      expect(r.speechDb).toBeLessThanOrEqual(c.speechDb);
      expect(r.voiceFocusDb).toBeLessThanOrEqual(c.voiceFocusDb);
      expect(r.ambientDb).toBeLessThanOrEqual(c.ambientDb);
      if (combinedPeakDb(c) <= MAX_BAND_BOOST_DB) {
        expect(r.extrasScale).toBe(1);
        expect(r.eqScale).toBe(1);
      }
      // Extras only shrink to zero before the EQ is touched.
      if (r.eqScale < 1) expect(r.extrasScale).toBe(0);
    }
    // About 2 s on an idle machine; the default 5 s timed out once under heavy load.
  }, 20_000);
});

describe('settings precedence', () => {
  it('Movie is the defaults', () => {
    const r = resolveSettings({ preset: 'movie' });
    expect(r.compressor).toEqual({
      kind: 'normal',
      thresholdDbfs: -24,
      kneeDb: 12,
      ratio: 4,
      attackMs: 10,
      releaseMs: 250,
    });
    expect(r.strength).toBe(1);
    expect(r.eqScale).toBe(1);
    expect(r.speechPeakDb).toBe(0);
    expect(r.loudestLimitDbfs).toBe(-12);
  });

  it('Speech sets its peak, ratio, voice focus and cleanup', () => {
    const r = resolveSettings({ preset: 'speech' });
    expect(r.speechPeakDb).toBe(3);
    expect(r.compressor.kind === 'normal' && r.compressor.ratio).toBe(3);
    expect(r.voiceFocus).toBe(0.5);
    expect(r.cleanupStrength).toBe(0.4);
  });

  it('manual changes override preset values', () => {
    const r = resolveSettings({
      preset: 'speech',
      manual: { voiceFocus: 0.2, strength: 1.2, compressorRatio: 5 },
    });
    expect(r.voiceFocus).toBe(0.2);
    expect(r.strength).toBe(1.2);
    expect(r.compressor.kind === 'normal' && r.compressor.ratio).toBe(5);
  });

  it('Music forces cleanup and voice focus to 0 unless turned on this session', () => {
    const remembered = { cleanupStrength: 0.6, voiceFocus: 0.7 };
    const r = resolveSettings({ preset: 'music', manual: remembered });
    expect(r.cleanupStrength).toBe(0);
    expect(r.voiceFocus).toBe(0);
    expect(r.eqScale).toBe(0.8);
    expect(r.compressor).toMatchObject({
      kind: 'normal',
      ratio: 2,
      thresholdDbfs: -18,
      kneeDb: 20,
    });
    const s = resolveSettings({
      preset: 'music',
      manual: remembered,
      session: { voiceFocus: 0.3 },
    });
    expect(s.voiceFocus).toBe(0.3);
    expect(s.cleanupStrength).toBe(0);
  });

  it('Night mode replaces the compressor stage', () => {
    expect(resolveSettings({ preset: 'night' }).compressor).toEqual({
      kind: 'night',
      level: 'medium',
    });
    expect(resolveSettings({ preset: 'night' }).strength).toBe(0.8);
    expect(resolveSettings({ preset: 'movie', manual: { nightMode: 'high' } }).compressor).toEqual({
      kind: 'night',
      level: 'high',
    });
    expect(resolveSettings({ preset: 'night', manual: { nightMode: 'off' } }).compressor.kind).toBe(
      'normal',
    );
  });

  it('Ambient boost adds at 2500 Hz and is clamped', () => {
    expect(resolveSettings({ preset: 'movie', ambientBoostDb: 4 }).ambientBoostDb).toBe(4);
    expect(resolveSettings({ preset: 'movie', ambientBoostDb: 40 }).ambientBoostDb).toBe(6);
  });

  it('every preset resolves to a complete object', () => {
    for (const preset of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
      const r = resolveSettings({ preset });
      for (const v of Object.values(r)) expect(v).not.toBeUndefined();
    }
  });
});

import {
  biquadCoefficients as bc,
  biquadMagnitudeDbAt as mag,
  frequencyPoint as fp,
} from './biquad.ts';
describe('lowshelf and lowpass (Web Audio formulas)', () => {
  const at = (spec: Parameters<typeof bc>[0], hz: number) => mag(bc(spec, 48000), fp(hz, 48000));
  it('lowshelf: full gain far below f0, half at f0, none far above', () => {
    const s = { type: 'lowshelf', frequencyHz: 500, gainDb: -12, q: 1 } as const;
    expect(at(s, 20)).toBeCloseTo(-12, 1);
    expect(at(s, 500)).toBeCloseTo(-6, 1);
    expect(at(s, 15000)).toBeCloseTo(0, 1);
  });
  it('lowpass: 0 dB in the pass band, Q (dB) at the cutoff, falling above', () => {
    const s = { type: 'lowpass', frequencyHz: 1000, gainDb: 0, q: 3 } as const;
    expect(at(s, 20)).toBeCloseTo(0, 1);
    expect(at(s, 1000)).toBeCloseTo(3, 0);
    expect(at(s, 8000)).toBeLessThan(-30);
  });
});
