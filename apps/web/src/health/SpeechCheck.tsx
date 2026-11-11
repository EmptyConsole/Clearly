import {
  DIN_START_SNR_DB,
  DIN_TRIPLETS,
  SIN_CHECK_VERSION,
  createRng,
  dinCategory,
  makeTriplet,
  nextSnr,
  scoreDin,
  tripletCorrect,
  type DinCategory,
  type Triplet,
} from '@clearly/core';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAudioEngine } from '../audio/AudioEngine.ts';
import { t, type MessageId } from '../copy/en.ts';
import { sinChecks } from '../storage/repos.ts';
import { useAppSettings } from '../store/appSettingsStore.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { useProfilesLoaded } from '../store/useProfiles.ts';
import { TEST_HOOKS_ENABLED } from '../test/hooks.ts';
import { Button, ButtonLink } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { ErrorPanel } from '../ui/ErrorPanel.tsx';
import { Loading, PageBody, PageHeading } from '../ui/Page.tsx';
import { ProgressBar } from '../ui/ProgressBar.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { DinPlayer, loadDigits } from './dinAudio.ts';
import { NumberPad } from './NumberPad.tsx';
import { tracker } from './tracker.ts';
import { useFlowStore } from '../check/flowStore.ts';

type Phase = 'intro' | 'loading' | 'noDigits' | 'listening' | 'answering' | 'result' | 'error';

declare global {
  interface Window {
    __clearlyDin?: { triplet: Triplet | null };
  }
}

export function SpeechCheck() {
  const loaded = useProfilesLoaded();
  const navigate = useNavigate();
  const profile = useProfileStore((s) => s.active);
  const updateOverrides = useProfileStore((s) => s.updateOverrides);
  const app = useAppSettings();
  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<{ srt: number; category: DinCategory } | null>(null);
  const [applied, setApplied] = useState(false);
  const run = useRef<{
    player: DinPlayer;
    digits: AudioBuffer[];
    rng: ReturnType<typeof createRng>;
    snr: number;
    snrs: number[];
    correct: boolean[];
    triplet: Triplet;
  } | null>(null);

  useEffect(() => {
    if (!app.loaded) void app.load();
  }, [app]);
  useEffect(
    () => () => {
      run.current?.player.dispose();
    },
    [],
  );

  const sessionLc = useFlowStore((s) => s.lcDbfs);
  const lc = profile?.calibration?.lcDbfs ?? sessionLc;

  const playNext = async () => {
    const r = run.current;
    if (!r) return;
    r.triplet = makeTriplet(r.rng);
    if (TEST_HOOKS_ENABLED) window.__clearlyDin = { triplet: r.triplet };
    setPhase('listening');
    const seconds = await r.player.play(r.digits, r.triplet, r.snr);
    tracker.record(r.player.noiseDbfs, seconds);
    setPhase('answering');
  };

  const start = () => {
    if (lc === null) return;
    const engine = getAudioEngine();
    const started = engine.start();
    setPhase('loading');
    started
      .then(async () => {
        const ctx = engine.context;
        if (!ctx) throw new Error('no audio');
        const digits = await loadDigits(ctx);
        if (!digits) {
          setPhase('noDigits');
          return;
        }
        const player = await DinPlayer.create(ctx, lc);
        run.current = {
          player,
          digits,
          rng: createRng(crypto.getRandomValues(new Uint32Array(1))[0] ?? 1),
          snr: DIN_START_SNR_DB,
          snrs: [],
          correct: [],
          triplet: [0, 1, 2],
        };
        setIndex(0);
        await playNext();
      })
      .catch(() => {
        setPhase('error');
      });
  };

  const submit = (answer: (number | null)[]) => {
    const r = run.current;
    if (!r) return;
    const ok = tripletCorrect(r.triplet, answer);
    r.snrs.push(r.snr);
    r.correct.push(ok);
    r.snr = nextSnr(r.snr, ok);
    const done = r.snrs.length;
    setIndex(done);
    if (done >= DIN_TRIPLETS) {
      const srt = scoreDin(r.snrs, r.correct);
      const category = dinCategory(srt);
      setResult({ srt, category });
      setPhase('result');
      void sinChecks.put({
        schemaVersion: SIN_CHECK_VERSION,
        id: crypto.randomUUID(),
        profileId: profile?.id ?? null,
        createdAt: new Date().toISOString(),
        headphoneName: profile?.headphoneName ?? t('headphones.default'),
        srtDb: Math.round(srt * 10) / 10,
        category,
        snrsDb: r.snrs,
      });
      return;
    }
    void playNext();
  };

  if (!loaded) return <Loading />;
  const skip = (
    <ButtonLink to="/more/health" variant="quiet">
      {t('sin.skip')}
    </ButtonLink>
  );

  if (lc === null) {
    return (
      <PageBody>
        <PageHeading>{t('sin.title')}</PageHeading>
        <Card className="mt-4">
          <h2 className="text-xl">{t('sin.needCal.title')}</h2>
          <p className="mt-1">{t('sin.needCal.body')}</p>
          <ButtonLink to="/check/calibrate?next=/more/health/speech" className="mt-3">
            {t('sin.needCal.action')}
          </ButtonLink>
        </Card>
        <div className="mt-4">{skip}</div>
      </PageBody>
    );
  }

  return (
    <PageBody>
      <PageHeading>{phase === 'result' ? t('sin.result.title') : t('sin.title')}</PageHeading>
      {phase === 'intro' ? (
        <>
          <p className="mt-3 text-lg">{t('sin.intro')}</p>
          <p className="mt-2">{t('sin.headphones')}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button className="text-lg" onClick={start}>
              {t('sin.start')}
            </Button>
            {skip}
          </div>
        </>
      ) : phase === 'loading' ? (
        <Loading />
      ) : phase === 'noDigits' ? (
        <Card className="mt-4">
          <h2 className="text-xl">{t('sin.noDigits.title')}</h2>
          <p className="mt-1">{t('sin.noDigits.body')}</p>
          <div className="mt-3">{skip}</div>
        </Card>
      ) : phase === 'error' ? (
        <div className="mt-4">
          <ErrorPanel
            title={t('error.audio.title')}
            what={t('error.audio.body')}
            tryThis={t('error.audio.try')}
            onRetry={start}
          />
        </div>
      ) : phase === 'result' && result ? (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-2xl font-semibold">
            {t(`sin.result.${result.category}` as MessageId)}
          </p>
          <p className="text-text-muted">{t('sin.result.note')}</p>
          {result.category !== 'good' ? (
            <Card>
              <Button
                onClick={() => {
                  void updateOverrides({ voiceFocus: 0.5, cleanupStrength: 0.4 }).then(() => {
                    if (result.category === 'considerable') void app.update({ preset: 'speech' });
                    setApplied(true);
                  });
                }}
              >
                {t('sin.result.apply')}
              </Button>
              <StatusLine>{applied ? t('sin.result.applyDone') : ''}</StatusLine>
              {result.category === 'considerable' ? (
                <>
                  <p className="mt-2">{t('sin.result.captions')}</p>
                  <p className="mt-2 font-semibold">{t('sin.result.professional')}</p>
                </>
              ) : null}
            </Card>
          ) : null}
          <div>
            <Button
              variant="secondary"
              onClick={() => {
                navigate('/more/health');
              }}
            >
              {t('sin.result.back')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <ProgressBar
            value={index}
            max={DIN_TRIPLETS}
            label={t('sin.progress')}
            valueText={t('sin.progressValue', { done: index, total: DIN_TRIPLETS })}
          />
          <StatusLine className="text-xl font-semibold">
            {phase === 'listening' ? t('sin.listen') : t('sin.typeNow')}
          </StatusLine>
          <NumberPad enabled={phase === 'answering'} onSubmit={submit} />
          <div>{skip}</div>
        </div>
      )}
    </PageBody>
  );
}
