import { useEffect, useState } from 'react';
import { t } from '../copy/en.ts';

/** A calm line while the device is offline. Everything except downloads and backup still works. */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => {
      setOnline(true);
    };
    const off = () => {
      setOnline(false);
    };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return (
    <div role="status" aria-live="polite">
      {online ? null : (
        <p className="border-b border-border bg-surface-sunken px-2 py-1 text-base font-semibold">
          {t('pwa.offline')}
        </p>
      )}
    </div>
  );
}
