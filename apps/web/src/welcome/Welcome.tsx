import { AGE_RANGES, expectedDurationSeconds, type AgeRange } from '@clearly/core';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ageLabel } from '../check/ageLabel.ts';
import { t } from '../copy/en.ts';
import { usePlatform } from '../platform/context.ts';
import { kv } from '../storage/repos.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { useProfilesLoaded } from '../store/useProfiles.ts';
import { Button, ButtonLink } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { ErrorPanel } from '../ui/ErrorPanel.tsx';
import { Loading, PageBody, PageHeading } from '../ui/Page.tsx';
import { Stepper } from '../ui/Stepper.tsx';
import { DemoListen } from './DemoListen.tsx';

const STEPS = [
  'welcome.step.welcome',
  'welcome.step.start',
  'welcome.step.hear',
  'welcome.step.watch',
] as const;

/** First run (M10): four steps with a stepper; skip any time; resumes where it stopped. */
export function Welcome() {
  const loaded = useProfilesLoaded();
  const [params] = useSearchParams();
  const fromUrl = params.has('step') ? Number(params.get('step')) : NaN;
  const urlStep = Number.isInteger(fromUrl) && fromUrl >= 0 && fromUrl <= 3 ? fromUrl : null;
  const [step, setStepState] = useState<number | null>(urlStep);
  useEffect(() => {
    if (urlStep !== null) return;
    void kv.get('onboarding').then((o) => {
      setStepState(o && !o.done ? o.step : 0);
    });
  }, [urlStep]);
  if (!loaded || step === null) return <Loading />;
  return <Flow step={step} setStepState={setStepState} />;
}

function Flow({ step, setStepState }: { step: number; setStepState: (n: number) => void }) {
  const navigate = useNavigate();
  const active = useProfileStore((s) => s.active);
  const setStep = (n: number) => {
    setStepState(n);
    void kv.set('onboarding', { step: n, done: false });
  };
  const skip = () => {
    void kv.set('onboarding', { step, done: false });
    navigate('/');
  };
  const finish = () => {
    void kv.set('onboarding', { step: 3, done: true });
  };
  const title = t(STEPS[step] ?? 'welcome.step.welcome');

  return (
    <PageBody>
      <Stepper
        label={t('welcome.stepper', { n: step + 1, total: STEPS.length })}
        steps={STEPS.map((s) => t(s))}
        current={step}
      />
      <div className="mt-6">
        {step === 0 ? (
          <>
            <PageHeading>{t('welcome.title')}</PageHeading>
            <p className="mt-3 text-lg">{t('welcome.body1')}</p>
            <p className="mt-2 text-lg">{t('welcome.body2')}</p>
            <p className="mt-2 font-semibold">{t('app.audioPromise')}</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                onClick={() => {
                  setStep(1);
                }}
              >
                {t('welcome.next')}
              </Button>
              <Link to="/restore">{t('welcome.restore')}</Link>
            </div>
          </>
        ) : step === 1 ? (
          <StartStep
            hasProfile={active !== null}
            onDone={() => {
              setStep(2);
            }}
            onMeasure={() => {
              void kv.set('onboarding', { step: 2, done: false });
              navigate('/check/before');
            }}
          />
        ) : step === 2 ? (
          <>
            <PageHeading>{t('welcome.hear.title')}</PageHeading>
            {active ? (
              <>
                <p className="mt-2 text-xl font-semibold">{t('welcome.hear.question')}</p>
                <div className="mt-4">
                  <DemoListen />
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      setStep(3);
                    }}
                  >
                    {t('welcome.hear.continue')}
                  </Button>
                  <ButtonLink
                    to="/check/before"
                    variant="secondary"
                    onClick={() => void kv.set('onboarding', { step: 3, done: false })}
                  >
                    {t('welcome.hear.fineTune')}
                  </ButtonLink>
                </div>
              </>
            ) : (
              <>
                <p className="mt-2">{t('welcome.hear.needProfile')}</p>
                <Button
                  className="mt-3"
                  onClick={() => {
                    setStep(1);
                  }}
                >
                  {t('welcome.back')}
                </Button>
              </>
            )}
          </>
        ) : (
          <WatchStep onFinish={finish} />
        )}
      </div>
      <div className="mt-8 flex flex-wrap gap-3 border-t border-border pt-3">
        {step > 0 ? (
          <Button
            variant="quiet"
            onClick={() => {
              setStep(step - 1);
            }}
          >
            {t('welcome.back')}
          </Button>
        ) : null}
        <Button variant="quiet" onClick={skip}>
          {t('welcome.skip')}
        </Button>
      </div>
      <span className="sr-only">{title}</span>
    </PageBody>
  );
}

function StartStep({
  hasProfile,
  onDone,
  onMeasure,
}: {
  hasProfile: boolean;
  onDone: () => void;
  onMeasure: () => void;
}) {
  const createStarter = useProfileStore((s) => s.createStarter);
  const [ages, setAges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<AgeRange | null>(null);
  const choose = (a: AgeRange) => {
    setSaving(true);
    setFailed(null);
    createStarter(a)
      .then(onDone)
      .catch(() => {
        setSaving(false);
        setFailed(a);
      });
  };
  return (
    <>
      <PageHeading>{t('welcome.start.title')}</PageHeading>
      {hasProfile ? <p className="mt-2 font-semibold">{t('welcome.start.done')}</p> : null}
      <div className="mt-4 grid gap-3">
        <Card>
          <Button
            className="text-xl"
            aria-expanded={ages}
            onClick={() => {
              setAges(true);
            }}
          >
            {t('welcome.start.quick')}
          </Button>
          <p className="mt-1 text-text-muted">{t('welcome.start.quickHint')}</p>
          {ages ? (
            <ul className="mt-3 grid grid-cols-1 gap-2 tablet:grid-cols-2">
              {AGE_RANGES.map((a) => (
                <li key={a}>
                  <Button
                    variant="secondary"
                    disabled={saving}
                    className="w-full text-xl"
                    onClick={() => {
                      choose(a);
                    }}
                  >
                    {ageLabel(a)}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {failed ? (
            <div className="mt-3">
              <ErrorPanel
                title={t('error.storage.title')}
                what={t('error.storage.body')}
                tryThis={t('error.storage.try')}
                onRetry={() => {
                  choose(failed);
                }}
              />
            </div>
          ) : null}
        </Card>
        <Card>
          <Button variant="secondary" className="text-xl" onClick={onMeasure}>
            {t('welcome.start.measure', { n: expectedDurationSeconds('express', 'normal') })}
          </Button>
          <p className="mt-1 text-text-muted">{t('welcome.start.measureHint')}</p>
        </Card>
        {hasProfile ? (
          <div>
            <Button variant="secondary" onClick={onDone}>
              {t('welcome.next')}
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}

function WatchStep({ onFinish }: { onFinish: () => void }) {
  const navigate = useNavigate();
  const platform = usePlatform();
  const canTab = platform.capabilities.tabAudioCapture;
  const go = (to: string) => {
    onFinish();
    navigate(to);
  };
  const cards: { title: string; body: string; to: string | null }[] = [
    {
      title: t('welcome.watch.tab'),
      body: canTab ? t('welcome.watch.tabBody') : t('welcome.watch.tabNone'),
      to: canTab ? '/audio?tab=1' : null,
    },
    { title: t('welcome.watch.file'), body: t('welcome.watch.fileBody'), to: '/audio' },
    {
      title: t('welcome.watch.desktop'),
      body: t('welcome.watch.desktopBody'),
      to: '/more/everywhere',
    },
    {
      title: t('welcome.watch.phone'),
      body: t('welcome.watch.phoneBody'),
      to: '/more/everywhere#phone',
    },
  ];
  return (
    <>
      <PageHeading>{t('welcome.watch.title')}</PageHeading>
      <ul className="mt-4 grid gap-3 tablet:grid-cols-2">
        {cards.map((c) => (
          <li key={c.title}>
            <Card className="flex h-full flex-col">
              <h2 className="text-xl">{c.title}</h2>
              <p className="mt-1 flex-1">{c.body}</p>
              {c.to ? (
                <Button
                  variant="secondary"
                  className="mt-3 self-start"
                  aria-label={`${t('welcome.watch.choose')}: ${c.title}`}
                  onClick={() => {
                    go(c.to ?? '/');
                  }}
                >
                  {t('welcome.watch.choose')}
                </Button>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
      <Button
        className="mt-6"
        onClick={() => {
          go('/');
        }}
      >
        {t('welcome.watch.finish')}
      </Button>
    </>
  );
}
