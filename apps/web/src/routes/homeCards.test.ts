import { describe, expect, it } from 'vitest';
import { backupReminderDue, homeSuggestion, persistTipDue } from './homeCards.ts';

const now = new Date('2026-11-09T12:00:00Z');
const base = {
  enabled: true,
  hasProfile: true,
  lastBackupAt: null,
  snoozedAt: null,
  firstDataAt: '2026-10-01T12:00:00Z',
  now,
};

describe('backup reminder', () => {
  it('is due 30 days after data first existed with no backup', () => {
    expect(backupReminderDue(base)).toBe(true);
    expect(backupReminderDue({ ...base, firstDataAt: '2026-10-20T12:00:00Z' })).toBe(false);
  });
  it('restarts after a backup and after "Not now"', () => {
    expect(backupReminderDue({ ...base, lastBackupAt: '2026-10-25T00:00:00Z' })).toBe(false);
    expect(backupReminderDue({ ...base, snoozedAt: '2026-11-01T00:00:00Z' })).toBe(false);
    expect(backupReminderDue({ ...base, snoozedAt: '2026-09-01T00:00:00Z' })).toBe(true);
  });
  it('can be turned off and needs a profile', () => {
    expect(backupReminderDue({ ...base, enabled: false })).toBe(false);
    expect(backupReminderDue({ ...base, hasProfile: false })).toBe(false);
  });
});

describe('persistence tip', () => {
  it('shows only when not persisted, not installed and not dismissed', () => {
    expect(persistTipDue({ persisted: false, standalone: false, dismissed: false })).toBe(true);
    expect(persistTipDue({ persisted: true, standalone: false, dismissed: false })).toBe(false);
    expect(persistTipDue({ persisted: null, standalone: false, dismissed: false })).toBe(false);
    expect(persistTipDue({ persisted: false, standalone: true, dismissed: false })).toBe(false);
    expect(persistTipDue({ persisted: false, standalone: false, dismissed: true })).toBe(false);
  });
});

describe('homeSuggestion (M10 rules in order, never two)', () => {
  const now = new Date('2026-11-09T12:00:00Z');
  const all = {
    estimated: true,
    hasSinResult: false,
    lastCheckAt: '2025-01-01T00:00:00Z',
    hasBackup: false,
    reminderDue: true,
    now,
  };
  it('1. an Estimated profile comes first, whatever else is true', () => {
    expect(homeSuggestion(all)).toBe('estimated');
  });
  it('2. then no speech-in-noise result', () => {
    expect(homeSuggestion({ ...all, estimated: false })).toBe('sin');
  });
  it('3. then a check older than 6 months', () => {
    expect(homeSuggestion({ ...all, estimated: false, hasSinResult: true })).toBe('old');
    expect(
      homeSuggestion({
        ...all,
        estimated: false,
        hasSinResult: true,
        lastCheckAt: '2026-05-10T12:00:00Z',
      }),
    ).toBe('backup');
  });
  it('4. then no backup, 5. then the reminder, otherwise none', () => {
    const fresh = {
      ...all,
      estimated: false,
      hasSinResult: true,
      lastCheckAt: '2026-10-01T00:00:00Z',
    };
    expect(homeSuggestion(fresh)).toBe('backup');
    expect(homeSuggestion({ ...fresh, hasBackup: true })).toBe('reminder');
    expect(homeSuggestion({ ...fresh, hasBackup: true, reminderDue: false })).toBeNull();
  });
});
