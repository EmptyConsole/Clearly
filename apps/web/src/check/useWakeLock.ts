import { useEffect } from 'react';
import { usePlatform } from '../platform/context.ts';

/** Keeps the screen awake while `active`, where the platform supports it. */
export function useWakeLock(active: boolean): void {
  const { capabilities } = usePlatform();
  useEffect(() => {
    if (!active || !capabilities.wakeLock) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((s) => {
          if (cancelled) void s.release();
          else sentinel = s;
        })
        .catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active, capabilities.wakeLock]);
}
