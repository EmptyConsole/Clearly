import type { SinCheck } from '@clearly/core';

/**
 * The one-time "Try Background cleanup" chip: shown when the latest speech-in-noise result (M08)
 * shows some or considerable difficulty, cleanup is not already on, and it was never dismissed.
 */
export function cleanupHintDue(
  checks: readonly SinCheck[],
  cleanupOn: boolean,
  dismissed: boolean,
): boolean {
  if (dismissed || cleanupOn) return false;
  const latest = [...checks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return latest !== undefined && latest.category !== 'good';
}
