import {
  CHECK_PROGRESS_VERSION,
  HearingCheckSession,
  NORMAL_OFFSET_DB,
  PRIOR_THRESHOLD_BELOW_LC_DB,
  createRng,
  effectivePace,
  mirrorEars,
  restoreSession,
  type Ear,
  type SessionConfig,
} from '@clearly/core';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useCheckAudio } from '../audio/context.ts';
import { t } from '../copy/en.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { useProfilesLoaded } from '../store/useProfiles.ts';
import { checkProgress } from '../storage/repos.ts';
import { tracker } from '../health/tracker.ts';
import { testHooks } from '../test/hooks.ts';
import { Audiogram } from '../ui/Audiogram.tsx';
import { seriesFromTracks } from '../ui/audiogramData.ts';
import { BigButton } from '../ui/BigButton.tsx';
import { Button } from '../ui/Button.tsx';
import { ErrorPanel } from '../ui/ErrorPanel.tsx';
import { PageBody, PageHeading } from '../ui/Page.tsx';
import { ProgressBar } from '../ui/ProgressBar.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { Switch } from '../ui/Switch.tsx';
import { REFINE_PROGRESS_ID } from './CheckStart.tsx';
import { EarIndicator } from './EarIndicator.tsx';
import { useFlowStore } from './flowStore.ts';
import { audioClock, CheckRunner, type RunnerClock, type RunnerUpdate } from './runner.ts';
import { useWakeLock } from './useWakeLock.ts';

const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;

const OFFSETS: Readonly<Record<number, number | undefined>> = NORMAL_OFFSET_DB;
const typicalRelLc = (hz: number): number => -PRIOR_THRESHOLD_BELOW_LC_DB + (OFFSETS[hz] ?? 0);

export interface StageProps {
  /** Tests inject a virtual clock; production uses the audio clock. */
  readonly clock?: RunnerClock;
}

export function Stage({ clock }: StageProps) {
  useProfilesLoaded();
  const flow = useFlowStore();
  const lcDbfs = flow.refine?.lcDbfs ?? flow.lcDbfs;
  if (lcDbfs === null) return <Navigate to="/check/calibrate" replace />;
  return <StageRun lcDbfs={lcDbfs} {...(clock ? { clock } : {})} />;
}

function StageRun({ lcDbfs, clock }: { lcDbfs: number; clock?: RunnerClock }) {
  const audio = useCheckAudio();
  const navigate = useNavigate();
  const flow = useFlowStore();
  const headphoneName = useProfileStore((s) => s.headphoneName);
  const saveCheck = useProfileStore((s) => s.saveCheck);
  // Captured once: the plan for this run must not change while it runs.
  const [refine] = useState(() => useFlowStore.getState().refine);
  const [ageRange] = useState(() => (refine ? refine.ageRange : useFlowStore.getState().ageRange));
  const method = refine ? 'refine' : 'express';
  // Headphones test each ear on its own; computer speakers reach both ears, so they are tested
  // together (one set of tracks, every tone in both channels, the result copied to both ears).
  const [output] = useState(() => refine?.output ?? useFlowStore.getState().output);
  const speakers = output === 'speakers';

  const initialPace = effectivePace(flow.pace, ageRange);
  const paceRef = useRef(initialPace);
  const [slower, setSlower] = useState(initialPace === 'slower');
  const answers = useRef<boolean[]>([...(refine?.responses ?? [])]);
  const rngSeed = useMemo(() => refine?.rngSeed ?? randomSeed(), [refine]);

  const session = useMemo(() => {
    const config: SessionConfig = {
      method,
      lcDbfs,
      ageRange,
      rng: createRng(rngSeed),
      ...(refine ? { seed: refine.seed } : {}),
      ...(speakers ? { ears: ['left'] as const } : {}),
    };
    return refine ? restoreSession(config, refine.responses) : new HearingCheckSession(config);
  }, [method, lcDbfs, ageRange, rngSeed, refine, speakers]);

  const [update, setUpdate] = useState<RunnerUpdate>(() => ({
    phase: 'idle',
    trial: null,
    heard: false,
    ...session.progress(),
  }));
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedForLater, setSavedForLater] = useState(false);
  const runner = useRef<CheckRunner | null>(null);
  const finishing = useRef(false);

  const finish = useCallback(() => {
    if (finishing.current) return;
    finishing.current = true;
    setSaving(true);
    const raw = session.result();
    const result = speakers ? mirrorEars(raw) : raw;
    saveCheck({
      result,
      ageRange,
      headphoneName: refine?.headphoneName ?? (speakers ? t('speakers.name') : headphoneName),
      output,
    })
      .then(async (outcome) => {
        if (refine) await checkProgress.delete(REFINE_PROGRESS_ID).catch(() => undefined);
        useFlowStore.getState().set({ refine: null });
        navigate(`/check/results/${outcome.record.id}`, { replace: true });
      })
      .catch(() => {
        finishing.current = false;
        setSaving(false);
        setError(true);
      });
  }, [session, saveCheck, ageRange, refine, headphoneName, navigate, speakers, output]);

  useEffect(() => {
    const hooks = testHooks();
    const r = new CheckRunner({
      session,
      audio,
      clock: clock ?? audioClock(audio),
      pace: () => paceRef.current,
      onUpdate: setUpdate,
      onAnswer: (heard) => {
        answers.current.push(heard);
      },
      onDone: finish,
      onTone: (rms, seconds) => {
        tracker.record(rms, seconds);
      },
      onError: () => {
        setError(true);
      },
      ...(hooks?.timeScale !== undefined ? { timeScale: hooks.timeScale } : {}),
      ...(hooks?.responder ? { responder: hooks.responder } : {}),
      bothEars: speakers,
    });
    runner.current = r;
    return () => {
      r.dispose();
    };
  }, [session, audio, clock, finish, speakers]);

  const running = update.phase === 'running';
  useWakeLock(running);

  const begin = useCallback(() => {
    // start() is called inside the click so the browser allows sound.
    audio
      .start()
      .then(() => {
        setError(false);
        runner.current?.start();
      })
      .catch(() => {
        setError(true);
      });
  }, [audio]);

  const respond = useCallback(() => {
    const r = runner.current;
    if (!r || r.state !== 'running') return;
    // vibrate is missing in some browsers despite the DOM types.
    if (r.tap() && 'vibrate' in navigator) navigator.vibrate(15);
  }, []);

  const togglePause = useCallback(() => {
    const r = runner.current;
    if (!r) return;
    if (r.state === 'running') r.pause();
    else if (r.state === 'paused') begin();
  }, [begin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (runner.current?.state === 'running') {
          e.preventDefault();
          runner.current.pause();
        }
        return;
      }
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const target = e.target as HTMLElement | null;
      // Space and Enter answer only from the test area or the page body, never from controls.
      if (target?.closest('[data-controls]')) return;
      if (runner.current?.state !== 'running') return;
      e.preventDefault();
      if (e.repeat) return;
      respond();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [respond]);

  const pauseForLater = () => {
    const r = runner.current;
    if (!r || !refine) return;
    r.pause();
    const now = new Date();
    checkProgress
      .put({
        schemaVersion: CHECK_PROGRESS_VERSION,
        id: REFINE_PROGRESS_ID,
        profileId: useProfileStore.getState().active?.id ?? 'none',
        method: 'refine',
        createdAt: now.toISOString(),
        expiresAt: checkProgress.expiryFrom(now),
        headphoneName: refine.headphoneName,
        ageRange,
        lcDbfs,
        rngSeed,
        seed: refine.seed,
        responses: answers.current,
        output: refine.output,
      })
      .then(() => {
        setSavedForLater(true);
        useFlowStore.getState().set({ refine: null });
      })
      .catch(() => {
        setError(true);
      });
  };

  const onAreaPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-controls]')) return;
    if (e.button !== 0) return;
    respond();
  };

  const ear: Ear | 'both' | null =
    update.trial?.kind === 'tone' ? (speakers ? 'both' : update.trial.ear) : null;
  const status = saving
    ? t('stage.status.done')
    : update.phase === 'paused'
      ? t('stage.status.paused')
      : update.phase === 'running'
        ? update.heard
          ? t('stage.status.heard')
          : t('stage.status.listening')
        : '';
  const finished = session.finishedTracks();
  // Speakers: the one set of tracks stands for both ears, as on the results page.
  const live = seriesFromTracks(
    speakers
      ? [...finished, ...finished.map((tr) => ({ ...tr, ear: 'right' as const }))]
      : finished,
    typicalRelLc,
  );

  if (savedForLater) {
    return (
      <PageBody>
        <PageHeading>{t('stage.pauseLater')}</PageHeading>
        <p className="mt-2 text-lg">{t('stage.pausedSaved')}</p>
        <Button
          className="mt-4"
          onClick={() => {
            navigate('/check');
          }}
        >
          {t('nav.check')}
        </Button>
      </PageBody>
    );
  }

  return (
    <PageBody wide>
      <PageHeading>
        {t(method === 'refine' ? 'stage.title.refine' : 'stage.title.express')}
      </PageHeading>
      <p className="mt-2 max-w-measure text-lg">{t('stage.instruction')}</p>
      <div className="mt-4 grid gap-6 desktop:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div
          className="flex flex-col items-center gap-3 rounded-surface bg-surface-sunken p-3 tablet:p-6"
          onPointerDown={onAreaPointerDown}
          data-testid="test-area"
        >
          <div className="flex w-full justify-center">
            <EarIndicator ear={ear} />
          </div>
          {error ? (
            <ErrorPanel
              title={t('error.audio.title')}
              what={t('error.audio.body')}
              tryThis={t('error.audio.try')}
              onRetry={begin}
            />
          ) : update.phase === 'idle' ? (
            <div className="flex flex-col items-center gap-2 py-6" data-controls>
              <Button className="text-lg" onClick={begin}>
                {t('stage.begin')}
              </Button>
              <p className="text-center text-text-muted">{t('stage.beginHint')}</p>
            </div>
          ) : (
            <BigButton
              aria-describedby="stage-keys"
              onPointerDown={(e) => {
                e.stopPropagation();
                if (e.button === 0) respond();
              }}
              onClick={(e) => {
                // Pointer taps were handled on pointerdown; keyboard activation is handled by the
                // window key listener, so a click event never counts twice.
                e.preventDefault();
              }}
              disabled={update.phase !== 'running'}
            >
              {t('stage.button')}
            </BigButton>
          )}
          <StatusLine className="text-center font-semibold">{status}</StatusLine>
          <p id="stage-keys" className="text-center text-sm text-text-muted">
            {t('stage.keys')}
          </p>
          <ProgressBar
            value={update.finished}
            max={update.total}
            label={t('stage.progress')}
            valueText={t('stage.progressValue', { done: update.finished, total: update.total })}
          />
        </div>
        <div className="flex flex-col gap-4" data-controls>
          <div className="flex flex-wrap gap-2">
            {update.phase === 'running' || update.phase === 'paused' ? (
              <Button variant="secondary" onClick={togglePause}>
                {update.phase === 'running' ? t('stage.pause') : t('stage.resume')}
              </Button>
            ) : null}
            {refine && update.phase !== 'idle' ? (
              <Button variant="secondary" onClick={pauseForLater}>
                {t('stage.pauseLater')}
              </Button>
            ) : null}
          </div>
          <Switch
            checked={slower}
            onCheckedChange={(v) => {
              setSlower(v);
              paceRef.current = v ? 'slower' : 'normal';
              flow.set({ pace: v ? 'slower' : 'normal' });
            }}
            label={t('stage.slower')}
            hint={t('stage.slowerHint')}
          />
          <section aria-labelledby="live-title">
            <h2 id="live-title" className="text-xl">
              {t('stage.liveTitle')}
            </h2>
            <Audiogram series={live} title={t('stage.liveTitle')} live />
          </section>
        </div>
      </div>
    </PageBody>
  );
}
