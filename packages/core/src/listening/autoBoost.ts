// Auto Boost (M09), pure. The microphone's level stands in for how noisy the room is; it never
// hears the ear, so this is a guide, not a measurement.
//
//   - Room level: microphone RMS in dBFS, smoothed with a 2 s attack and a 5 s release (one-pole
//     in dB; time constants are the 63 percent points).
//   - Hysteresis: a 3 dB backlash. The level used for the mapping only moves once the smoothed
//     level is more than 1.5 dB from it, so small wobbles never move the boost.
//   - Mapping: below the quiet threshold (-55 dBFS) nothing changes; from there to the loud
//     threshold (-30 dBFS) the Ambient-boost peak rises linearly from 0 to +6 dB and the
//     compressor threshold drops linearly by 0 to 6 dB. Sensitivity shifts both thresholds by
//     5 dB (High listens for quieter rooms: -60 and -35; Low: -50 and -25).
//   - Feedback guard: a running Pearson correlation between the output envelope and the
//     microphone envelope over the last 10 s. Above 0.6 for 5 s means the microphone is hearing
//     the programme (speakers): the boost freezes until the person resumes it.
//   - Everything goes through resolveSettings, so the summed-boost clamp still applies.

import { AMBIENT_BOOST_MAX_DB } from '../constants.ts';
import { clamp } from '../math.ts';

export type AutoBoostSensitivity = 'low' | 'medium' | 'high';

export const ROOM_QUIET_DBFS = -55;
export const ROOM_LOUD_DBFS = -30;
export const SENSITIVITY_SHIFT_DB = 5;
export const ROOM_ATTACK_S = 2;
export const ROOM_RELEASE_S = 5;
export const AUTO_BOOST_HYSTERESIS_DB = 3;
export const AUTO_BOOST_THRESHOLD_DROP_MAX_DB = 6;
export const FEEDBACK_WINDOW_S = 10;
export const FEEDBACK_CORRELATION = 0.6;
export const FEEDBACK_HOLD_S = 5;
/** Levels below this are treated as silence (a closed or muted microphone). */
const FLOOR_DBFS = -100;

export function roomThresholds(s: AutoBoostSensitivity): { quiet: number; loud: number } {
  const shift = s === 'high' ? -SENSITIVITY_SHIFT_DB : s === 'low' ? SENSITIVITY_SHIFT_DB : 0;
  return { quiet: ROOM_QUIET_DBFS + shift, loud: ROOM_LOUD_DBFS + shift };
}

/** Share of the full effect for a room level, 0 to 1. */
export function boostShare(roomDbfs: number, s: AutoBoostSensitivity): number {
  const { quiet, loud } = roomThresholds(s);
  return clamp((roomDbfs - quiet) / (loud - quiet), 0, 1);
}

/** Two-speed one-pole smoother in dB: rises with the attack, falls with the release. */
export class RoomLevelSmoother {
  private value: number | null = null;
  update(levelDbfs: number, dtS: number): number {
    const x = Number.isFinite(levelDbfs) ? Math.max(FLOOR_DBFS, levelDbfs) : FLOOR_DBFS;
    if (this.value === null) {
      this.value = x;
      return x;
    }
    const tau = x > this.value ? ROOM_ATTACK_S : ROOM_RELEASE_S;
    this.value += (x - this.value) * (1 - Math.exp(-Math.max(0, dtS) / tau));
    return this.value;
  }
  get current(): number | null {
    return this.value;
  }
  reset(): void {
    this.value = null;
  }
}

/** Backlash hysteresis: the output follows the input only once it is more than width/2 away. */
export class Backlash {
  private held: number | null = null;
  private readonly width: number;
  constructor(width: number) {
    this.width = width;
  }
  update(x: number): number {
    const half = this.width / 2;
    if (this.held === null) this.held = x;
    else if (x > this.held + half) this.held = x - half;
    else if (x < this.held - half) this.held = x + half;
    return this.held;
  }
  reset(): void {
    this.held = null;
  }
}

/** Pearson correlation of two equal-length series; 0 when either is flat. */
export function correlation(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i] ?? 0;
    mb += b[i] ?? 0;
  }
  ma /= n;
  mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = (a[i] ?? 0) - ma;
    const db = (b[i] ?? 0) - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  // Less than 0.5 dB of movement is no envelope at all.
  if (saa < 0.25 * n || sbb < 0.25 * n) return 0;
  return sab / Math.sqrt(saa * sbb);
}

/** Watches whether the microphone is hearing the programme. */
export class FeedbackGuard {
  private samples: { t: number; out: number; mic: number }[] = [];
  private highSince: number | null = null;
  private t = 0;
  tripped = false;
  latest = 0;

  update(outDbfs: number, micDbfs: number, dtS: number): boolean {
    this.t += Math.max(0, dtS);
    const f = (x: number) => (Number.isFinite(x) ? Math.max(FLOOR_DBFS, x) : FLOOR_DBFS);
    this.samples.push({ t: this.t, out: f(outDbfs), mic: f(micDbfs) });
    this.samples = this.samples.filter((s) => this.t - s.t <= FEEDBACK_WINDOW_S + 1e-9);
    const full = this.t - (this.samples[0]?.t ?? this.t) >= FEEDBACK_WINDOW_S / 2;
    this.latest = full
      ? correlation(
          this.samples.map((s) => s.out),
          this.samples.map((s) => s.mic),
        )
      : 0;
    if (this.latest > FEEDBACK_CORRELATION) {
      this.highSince ??= this.t;
      if (this.t - this.highSince >= FEEDBACK_HOLD_S - 1e-9) this.tripped = true;
    } else {
      this.highSince = null;
    }
    return this.tripped;
  }

  reset(): void {
    this.samples = [];
    this.highSince = null;
    this.t = 0;
    this.tripped = false;
    this.latest = 0;
  }
}

export interface AutoBoostReading {
  /** Smoothed room level in dBFS (null before the first reading). */
  readonly roomDbfs: number | null;
  /** Extra gain on the Ambient-boost peak, 0 to +6 dB. */
  readonly boostDb: number;
  /** How far the compressor threshold is lowered, 0 to 6 dB. */
  readonly thresholdDropDb: number;
  /** The feedback guard froze the boost. */
  readonly paused: boolean;
}

export class AutoBoostController {
  private readonly smoother = new RoomLevelSmoother();
  private readonly backlash = new Backlash(AUTO_BOOST_HYSTERESIS_DB);
  readonly guard = new FeedbackGuard();
  private boost = 0;
  private drop = 0;
  sensitivity: AutoBoostSensitivity = 'medium';

  /** One reading: the microphone's and the output's RMS over the last dtS seconds. */
  update(micDbfs: number, outDbfs: number, dtS: number): AutoBoostReading {
    const room = this.smoother.update(micDbfs, dtS);
    const paused = this.guard.update(outDbfs, micDbfs, dtS);
    if (!paused) {
      const share = boostShare(this.backlash.update(room), this.sensitivity);
      this.boost = AMBIENT_BOOST_MAX_DB * share;
      this.drop = AUTO_BOOST_THRESHOLD_DROP_MAX_DB * share;
    }
    return { roomDbfs: room, boostDb: this.boost, thresholdDropDb: this.drop, paused };
  }

  /** After a feedback pause: listen afresh. */
  resume(): void {
    this.guard.reset();
  }

  reset(): void {
    this.smoother.reset();
    this.backlash.reset();
    this.guard.reset();
    this.boost = 0;
    this.drop = 0;
  }
}
