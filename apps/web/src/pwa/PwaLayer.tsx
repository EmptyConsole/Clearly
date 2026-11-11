import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { t } from '../copy/en.ts';
import { hearingChecks, kv } from '../storage/repos.ts';
import { Button } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import {
  hasManualAddToHomeScreen,
  installOffer,
  isStandaloneNow,
  useInstall,
  type InstallOffer,
} from './install.ts';

/** Service worker update prompt and the one-time install offers. */
export default function PwaLayer() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });
  const event = useInstall((s) => s.event);
  const [offer, setOffer] = useState<InstallOffer>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([hearingChecks.list(), kv.get('installOfferShown')]).then(
      ([checks, shown]) => {
        if (!live) return;
        setOffer(
          installOffer({
            hasPromptEvent: event !== null,
            standalone: isStandaloneNow(),
            manualA2hs: hasManualAddToHomeScreen(),
            checksDone: checks.length,
            alreadyShown: shown === true,
          }),
        );
      },
    );
    return () => {
      live = false;
    };
  }, [event]);

  const done = () => {
    setOffer(null);
    void kv.set('installOfferShown', true);
  };

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-2 px-2 tablet:px-4">
      {needRefresh ? (
        <Card className="mt-2 flex flex-wrap items-center gap-2" role="status">
          <p className="font-semibold">{t('pwa.update')}</p>
          <Button onClick={() => void updateServiceWorker(true)}>{t('pwa.reload')}</Button>
          <Button
            variant="quiet"
            onClick={() => {
              setNeedRefresh(false);
            }}
          >
            {t('pwa.later')}
          </Button>
        </Card>
      ) : null}
      {offer === 'prompt' && event ? (
        <Card className="mt-2" role="region" aria-label={t('pwa.install.title')}>
          <h2 className="text-xl">{t('pwa.install.title')}</h2>
          <p className="mt-1">{t('pwa.install.body')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                void event.prompt().finally(done);
              }}
            >
              {t('pwa.install.yes')}
            </Button>
            <Button variant="secondary" onClick={done}>
              {t('pwa.install.no')}
            </Button>
          </div>
        </Card>
      ) : offer === 'manual' ? (
        <Card className="mt-2" role="region" aria-label={t('pwa.install.title')}>
          <h2 className="text-xl">{t('pwa.install.title')}</h2>
          <p className="mt-1">{t('pwa.install.manual')}</p>
          <Button variant="secondary" className="mt-2" onClick={done}>
            {t('pwa.install.gotIt')}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
