import { useEffect, useState } from 'react';
import { t } from '../copy/en.ts';
import { Button } from '../ui/Button.tsx';
import { getAudioEngine } from './AudioEngine.ts';

/**
 * When the system pauses Clearly's sound (a phone call, another app taking the audio, the computer
 * sleeping), say so and offer one tap to carry on, instead of going quiet without a word (M14).
 * Pauses Clearly makes on purpose (engine.hold) explain themselves where they happen.
 */
export function SuspendedBanner() {
  const engine = getAudioEngine();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let wasRunning = engine.store.getState().status === 'running';
    return engine.store.subscribe((s) => {
      if (s.status === 'running') {
        wasRunning = true;
        setShow(false);
      } else if (s.status === 'suspended' && wasRunning && !s.held) {
        setShow(true);
      }
    });
  }, [engine]);

  if (!show) return null;
  return (
    <div role="alert" className="border-b border-border bg-surface-sunken">
      <div className="mx-auto flex w-full max-w-content flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1 tablet:px-4">
        <p className="font-semibold">{t('engine.suspended')}</p>
        <Button
          variant="quiet"
          onClick={() => {
            void engine.resume().catch(() => undefined);
          }}
        >
          {t('engine.resume')}
        </Button>
      </div>
    </div>
  );
}
