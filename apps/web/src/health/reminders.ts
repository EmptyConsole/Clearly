// Hearing Check reminder (M08): due every N months (default 6), never more than once a week.
// The local notification is sent only while Clearly is open (there is no push server).

import { REMINDER_DEFAULT_MONTHS, reminderDue } from '@clearly/core';
import { t } from '../copy/en.ts';
import { hearingChecks, kv } from '../storage/repos.ts';

export async function checkReminderDue(now: Date = new Date()): Promise<boolean> {
  const [checks, months, last] = await Promise.all([
    hearingChecks.list(),
    kv.get('reminderMonths'),
    kv.get('lastRemindedAt'),
  ]);
  const measured = checks.filter((c) => c.audiogram.method !== 'starter');
  const latest = (measured.at(-1) ?? checks.at(-1))?.createdAt ?? null;
  return reminderDue(latest, last ?? null, months ?? REMINDER_DEFAULT_MONTHS, now);
}

export async function markReminded(now: Date = new Date()): Promise<void> {
  await kv.set('lastRemindedAt', now.toISOString());
}

/** Sends the notification if it is due, wanted and allowed. Runs once when the app opens. */
export async function notifyIfDue(): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if ((await kv.get('reminderNotify')) !== true) return;
  if (!(await checkReminderDue())) return;
  new Notification(t('reminder.check.title'), { body: t('reminder.check.body') });
  await markReminded();
}
