import { expectedDurationSeconds } from '@clearly/core';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAudioEngine } from '../audio/AudioEngine.ts';
import { t, type MessageId } from '../copy/en.ts';
import { checkReminderDue, markReminded } from '../health/reminders.ts';
import { usePlayerStore } from '../player/playerStore.ts';
import { hearingChecks, kv, sinChecks } from '../storage/repos.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { useProfilesLoaded } from '../store/useProfiles.ts';
import { Button, ButtonLink } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { EstimatedBadge } from '../ui/EstimatedBadge.tsx';
import { Loading, PageBody, PageHeading } from '../ui/Page.tsx';
import { Audiogram } from '../ui/Audiogram.tsx';
import { seriesFromAudiogram } from '../ui/audiogramData.ts';
import { HomeNotices } from './HomeNotices.tsx';
import { homeSuggestion, type Suggestion } from './homeCards.ts';

export function Home() {
  const loaded = useProfilesLoaded();
  const active = useProfileStore((s) => s.active);
  if (!loaded) return <Loading />;
  return active ? <Dashboard /> : <NewUser />;
}

/** No profile yet: one dominant action. */
function NewUser() {
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    void kv.get('onboarding').then((o) => {
      setStep(o && !o.done ? o.step : null);
    });
  }, []);
  return (
    <PageBody>
      <PageHeading>{t('home.new.title')}</PageHeading>
      <p className="mt-3 text-lg">{t('home.new.lead')}</p>
      <p className="mt-2 text-text-muted">{t('app.audioPromise')}</p>
      <ButtonLink to={step ? `/welcome?step=${step}` : '/welcome'} className="mt-6 text-xl">
        {t('home.new.cta')}
      </ButtonLink>
      <p className="mt-4">
        <Link to="/restore">{t('restore.link')}</Link>
      </p>
    </PageBody>
  );
}

const SUGGESTION: Record<
  Exclude<Suggestion, 'reminder' | null>,
  { body: MessageId; action: MessageId; to: string }
> = {
  estimated: {
    body: 'home.suggest.estimated',
    action: 'home.suggest.estimatedAction',
    to: '/check/before',
  },
  sin: { body: 'home.suggest.sin', action: 'home.suggest.sinAction', to: '/more/health/speech' },
  old: { body: 'home.suggest.old', action: 'home.suggest.oldAction', to: '/check/before' },
  backup: {
    body: 'home.suggest.backup',
    action: 'home.suggest.backupAction',
    to: '/more/settings#storage',
  },
};

/** A returning person: Start Clear Audio first, then at most one suggestion. */
function Dashboard() {
  const navigate = useNavigate();
  const active = useProfileStore((s) => s.active);
  const source = usePlayerStore((s) => s.source);
  const setSource = usePlayerStore((s) => s.setSource);
  const [last, setLast] = useState<'demo' | 'file' | 'tab' | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | undefined>(undefined);

  useEffect(() => {
    const state = { live: true };
    const profile = active;
    if (!profile) return;
    void (async () => {
      const [lastSource, checks, sins, backupAt, sync, reminder] = await Promise.all([
        kv.get('lastSource'),
        hearingChecks.list(),
        sinChecks.list(),
        kv.get('lastBackupAt'),
        kv.get('sync'),
        checkReminderDue(),
      ]);
      if (!state.live) return;
      const newest = [...checks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      setLast(lastSource ?? null);
      setSuggestion(
        homeSuggestion({
          estimated: profile.audiogram.method === 'starter',
          hasSinResult: sins.length > 0,
          lastCheckAt: newest?.createdAt ?? profile.audiogram.createdAt,
          hasBackup: Boolean(backupAt) || Boolean(sync),
          reminderDue: reminder,
          now: new Date(),
        }),
      );
    })().catch(() => {
      if (state.live) setSuggestion(null);
    });
    return () => {
      state.live = false;
    };
  }, [active]);

  if (!active || suggestion === undefined) return <Loading />;
  const starter = active.audiogram.method === 'starter';

  // Resume where possible: a source still open, the demo, or a tab (coach and picker again).
  const start = () => {
    if (source) {
      navigate('/audio/player');
      return;
    }
    if (last === 'demo') {
      void getAudioEngine()
        .start()
        .catch(() => undefined);
      setSource({ kind: 'demo' });
      navigate('/audio/player');
      return;
    }
    navigate(last === 'tab' ? '/audio?tab=1' : '/audio');
  };
  const startLabel =
    source || last === 'demo'
      ? t('home.resumeDemo')
      : last === 'tab'
        ? t('home.resumeTab')
        : t('home.startAudio');

  return (
    <PageBody wide>
      <div className="grid gap-6 wide:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] wide:items-start">
        <div>
          <PageHeading>{t('home.dash.title')}</PageHeading>
          <p className="mt-2 text-lg text-text-muted">{t('app.audioPromise')}</p>
          <Button
            className="mt-6 min-h-[var(--t-space-8)] w-full px-6 text-2xl tablet:w-auto"
            onClick={start}
          >
            {source ? t('home.startAudio') : startLabel}
          </Button>
          <p className="mt-2 text-text-muted">{t('home.startAudioHint')}</p>

          {suggestion && suggestion !== 'reminder' ? (
            <Card className="mt-8" role="region" aria-labelledby="home-suggest">
              <h2 id="home-suggest" className="text-xl">
                {t('home.suggest.title')}
              </h2>
              <p className="mt-1">{t(SUGGESTION[suggestion].body)}</p>
              <ButtonLink to={SUGGESTION[suggestion].to} variant="secondary" className="mt-3">
                {suggestion === 'estimated'
                  ? `${t(SUGGESTION[suggestion].action)} (${t('home.aboutSeconds', { n: expectedDurationSeconds('express', 'normal') })})`
                  : t(SUGGESTION[suggestion].action)}
              </ButtonLink>
            </Card>
          ) : suggestion === 'reminder' ? (
            <Card className="mt-8">
              <h2 className="text-xl">{t('reminder.check.title')}</h2>
              <p className="mt-1">{t('reminder.check.body')}</p>
              <ButtonLink to="/check/before" className="mt-3" onClick={() => void markReminded()}>
                {t('reminder.check.action')}
              </ButtonLink>
            </Card>
          ) : (
            <HomeNotices hasProfile />
          )}
        </div>

        <Card>
          <h2 className="text-xl">{t('home.profileTitle')}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-semibold">{active.name}</span>
            {starter ? <EstimatedBadge /> : null}
          </p>
          <p className="mt-1 text-text-muted">
            {starter
              ? t('home.profileEstimated')
              : t('home.profileMeasured', {
                  date: new Date(active.audiogram.createdAt).toLocaleDateString(undefined, {
                    dateStyle: 'long',
                  }),
                })}
          </p>
          <div className="mt-3">
            <Audiogram
              series={seriesFromAudiogram(active.audiogram)}
              title={t('home.profileTitle')}
            />
          </div>
          <Link to="/more/settings" className="mt-2 inline-block">
            {t('nav.profileSettings')}
          </Link>
        </Card>
      </div>
    </PageBody>
  );
}
