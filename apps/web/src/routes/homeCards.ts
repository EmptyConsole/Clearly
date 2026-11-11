// Pure rules for the Home cards added in M04 (unit-tested).

export const BACKUP_REMINDER_DAYS = 30;
const DAY = 86_400_000;

export interface ReminderInput {
  readonly enabled: boolean;
  readonly hasProfile: boolean;
  readonly lastBackupAt: string | null;
  readonly snoozedAt: string | null;
  /** When the person's data first existed (oldest profile or check). */
  readonly firstDataAt: string | null;
  readonly now: Date;
}

/** Due every 30 days after the last backup (or after data first existed), unless snoozed. */
export function backupReminderDue(i: ReminderInput): boolean {
  if (!i.enabled || !i.hasProfile) return false;
  const since = i.lastBackupAt ?? i.firstDataAt;
  if (!since) return false;
  const now = i.now.getTime();
  if (now - Date.parse(since) < BACKUP_REMINDER_DAYS * DAY) return false;
  if (i.snoozedAt && now - Date.parse(i.snoozedAt) < BACKUP_REMINDER_DAYS * DAY) return false;
  return true;
}

export interface PersistTipInput {
  readonly persisted: boolean | null;
  readonly standalone: boolean;
  readonly dismissed: boolean;
}

/** Shown once where storage is not persisted and the app is not installed (capability only). */
export function persistTipDue(i: PersistTipInput): boolean {
  return i.persisted === false && !i.standalone && !i.dismissed;
}

/** Installed-app detection by feature, never by browser name. */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

// ---------------------------------------------------------------------------------------------
// Home suggestion (M10): at most one card, chosen by these rules in order.

export type Suggestion = 'estimated' | 'sin' | 'old' | 'backup' | 'reminder' | null;
export const CHECK_STALE_MONTHS = 6;

export interface SuggestionInput {
  /** The active profile was made by Quick start (age only). */
  readonly estimated: boolean;
  readonly hasSinResult: boolean;
  /** When the newest Hearing Check (or the profile) was made, or null. */
  readonly lastCheckAt: string | null;
  /** A backup file was saved or a restore code / sync is set up. */
  readonly hasBackup: boolean;
  /** The M08 check reminder is due. */
  readonly reminderDue: boolean;
  readonly now: Date;
}

function monthsBefore(now: Date, months: number): number {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d.getTime();
}

export function homeSuggestion(i: SuggestionInput): Suggestion {
  if (i.estimated) return 'estimated';
  if (!i.hasSinResult) return 'sin';
  if (i.lastCheckAt && Date.parse(i.lastCheckAt) < monthsBefore(i.now, CHECK_STALE_MONTHS))
    return 'old';
  if (!i.hasBackup) return 'backup';
  if (i.reminderDue) return 'reminder';
  return null;
}
