import { useEffect, useState } from 'react';
import { t } from '../copy/en.ts';
import { kv } from '../storage/repos.ts';
import { ButtonLink } from '../ui/Button.tsx';

/** Shown where the first-run flow sent someone away (a full check): back to where it stopped. */
export function ContinueSetup({ className }: { className?: string }) {
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    void kv.get('onboarding').then((o) => {
      if (o && !o.done) setStep(o.step);
    });
  }, []);
  if (step === null) return null;
  return (
    <ButtonLink to={`/welcome?step=${step}`} variant="secondary" className={className}>
      {t('welcome.continueSetup')}
    </ButtonLink>
  );
}
