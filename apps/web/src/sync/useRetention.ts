import { useEffect, useState } from 'react';
import { z } from 'zod';

/** The server's default retention (PROFILE_RETENTION_DAYS 540), used until it answers. */
export const DEFAULT_RETENTION_DAYS = 540;

const health = z.object({ ok: z.literal(true), retentionDays: z.number().int().min(1) });

/** Months of non-use after which the server deletes a backup, as the server reports it. */
export function useRetentionMonths(): number {
  const [days, setDays] = useState(DEFAULT_RETENTION_DAYS);
  useEffect(() => {
    let live = true;
    fetch('/api/health')
      .then((r) => r.json())
      .then((j: unknown) => {
        const p = health.safeParse(j);
        if (live && p.success) setDays(p.data.retentionDays);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return Math.round(days / 30);
}
