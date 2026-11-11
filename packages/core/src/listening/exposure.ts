// Safe-listening tracker maths (M08), pure. Levels are relative to the person's comfortable level:
// the calibration tone peaks at Lc dBFS, and a sine's RMS is 3 dB below its peak, so the reference
// RMS is Lc - 3 dBFS. Never a dB SPL figure: browsers cannot know the output level.

export type Zone = 'comfortable' | 'loud' | 'veryLoud';
export const SINE_RMS_BELOW_PEAK_DB = 3;
export const LOUD_ZONE_DB = 6;
/** Default daily alert: 15 minutes in the Very loud zone. */
export const VERY_LOUD_ALERT_MINUTES = 15;

export function referenceRmsDbfs(lcDbfs: number): number {
  return lcDbfs - SINE_RMS_BELOW_PEAK_DB;
}

/** Comfortable below the reference; Loud up to 6 dB above it; Very loud beyond. */
export function zoneFor(rmsDbfs: number, lcDbfs: number): Zone {
  const ref = referenceRmsDbfs(lcDbfs);
  if (rmsDbfs < ref) return 'comfortable';
  if (rmsDbfs <= ref + LOUD_ZONE_DB) return 'loud';
  return 'veryLoud';
}

/** Stereo power mean of one block, in dBFS (silence gives -Infinity). */
export function stereoRmsDbfs(left: Float32Array, right: Float32Array): number {
  let p = 0;
  const n = Math.max(1, left.length);
  for (let i = 0; i < left.length; i++) p += (left[i] ?? 0) ** 2 + (right[i] ?? 0) ** 2;
  const ms = p / (2 * n);
  return ms > 0 ? 10 * Math.log10(ms) : -Infinity;
}

/** The local calendar date (YYYY-MM-DD) of a moment, in the device's time zone. */
export function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface DayTotals {
  readonly comfortableMinutes: number;
  readonly loudMinutes: number;
  readonly veryLoudMinutes: number;
}

/**
 * Adds `seconds` of listening in a zone that ended at `end`, splitting it across midnight (local
 * time, so DST days of 23 or 25 hours are handled by the Date arithmetic). Returns per-day
 * additions in minutes.
 */
export function addListening(zone: Zone, seconds: number, end: Date): Map<string, DayTotals> {
  const out = new Map<string, DayTotals>();
  let remaining = seconds;
  let cursor = new Date(end.getTime());
  while (remaining > 1e-9) {
    const startOfDay = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    const available = (cursor.getTime() - startOfDay.getTime()) / 1000;
    const take = available > 0 ? Math.min(remaining, available) : remaining;
    const key = localDay(new Date(cursor.getTime() - 1));
    const prev = out.get(key) ?? { comfortableMinutes: 0, loudMinutes: 0, veryLoudMinutes: 0 };
    const add = take / 60;
    out.set(key, {
      comfortableMinutes: prev.comfortableMinutes + (zone === 'comfortable' ? add : 0),
      loudMinutes: prev.loudMinutes + (zone === 'loud' ? add : 0),
      veryLoudMinutes: prev.veryLoudMinutes + (zone === 'veryLoud' ? add : 0),
    });
    remaining -= take;
    cursor = startOfDay;
    if (available <= 0) break;
  }
  return out;
}

/** The daily alert fires once per day, when Very loud minutes reach the limit. */
export function alertDue(
  veryLoudMinutes: number,
  limitMinutes: number,
  alreadyAlertedToday: boolean,
): boolean {
  return !alreadyAlertedToday && veryLoudMinutes >= limitMinutes;
}

// Hearing Check reminders --------------------------------------------------------------------

export const REMINDER_DEFAULT_MONTHS = 6;
export const REMINDER_MIN_GAP_DAYS = 7;

/**
 * Due when the last check is older than the interval, and the person has not been reminded in
 * the last 7 days. Off when months is 0.
 */
export function reminderDue(
  lastCheckAt: string | null,
  lastRemindedAt: string | null,
  months: number,
  now: Date,
): boolean {
  if (months <= 0 || !lastCheckAt) return false;
  const last = new Date(lastCheckAt);
  const due = new Date(
    last.getFullYear(),
    last.getMonth() + months,
    last.getDate(),
    last.getHours(),
    last.getMinutes(),
  );
  if (now < due) return false;
  if (
    lastRemindedAt &&
    now.getTime() - Date.parse(lastRemindedAt) < REMINDER_MIN_GAP_DAYS * 86_400_000
  ) {
    return false;
  }
  return true;
}
