import { CALIBRATION_MAX_DBFS, CALIBRATION_TOO_FAST_MS } from '@clearly/core';
import type { CalibrationRamp as Ramp } from '@clearly/audio';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCheckAudio } from '../audio/context.ts';
import { t } from '../copy/en.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { useProfilesLoaded } from '../store/useProfiles.ts';
import { testHooks } from '../test/hooks.ts';
import { BigButton } from '../ui/BigButton.tsx';
import { Button } from '../ui/Button.tsx';
import { ErrorPanel } from '../ui/ErrorPanel.tsx';
import { PageBody, PageHeading } from '../ui/Page.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { useFlowStore } from './flowStore.ts';

type Phase = 'ready' | 'playing' | 'tooFast' | 'reachedTop' | 'error';

export function Calibration() {
  // The profile store must be loaded so the level is stored on the active profile.
  useProfilesLoaded();
  const audio = useCheckAudio();
  const navigate = useNavigate();
  // ?next= returns to another screen (the speech-in-noise check) after the level is set.
  const [params] = useSearchParams();
  const nextParam = params.get('next');
  const next =
    nextParam?.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/check/test';
  const setFlow = useFlowStore((s) => s.set);
  const saveCalibration = useProfileStore((s) => s.saveCalibration);
  const [phase, setPhase] = useState<Phase>('ready');
  const ramp = useRef<Ramp | null>(null);
  const answered = useRef(false);
  const tapRef = useRef<HTMLButtonElement>(null);

  useEffect(
    () => () => {
      // Leaving the screen stops the tone.
      if (ramp.current && !answered.current) ramp.current.stop();
    },
    [],
  );

  const finish = (level: number) => {
    setFlow({ lcDbfs: level });
    // Wait for the profile store (loading started on mount), then store the level on the profile.
    void (async () => {
      const s = useProfileStore.getState();
      if (!s.loaded) await s.load();
      await saveCalibration(level);
    })().catch(() => undefined);
    navigate(next);
  };

  const answer = () => {
    const r = ramp.current;
    if (!r || answered.current) return;
    answered.current = true;
    const elapsedMs = (audio.now() - r.onsetTime) * 1000;
    const level = r.stop();
    if (elapsedMs < CALIBRATION_TOO_FAST_MS) {
      setPhase('tooFast');
      return;
    }
    finish(level);
  };

  const play = () => {
    answered.current = false;
    // start() runs inside this click, so the browser allows sound.
    const started = audio.start();
    setPhase('playing');
    started
      .then(() => audio.calibrationRamp())
      .then((r: Ramp) => {
        ramp.current = r;
        tapRef.current?.focus();
        void r.ended.then(() => {
          if (!answered.current) {
            answered.current = true;
            setPhase('reachedTop');
          }
        });
        const hookLevel = testHooks()?.calibrationLevelDbfs;
        if (hookLevel !== undefined) {
          const poll = () => {
            if (answered.current) return;
            if (r.levelAt() >= Math.min(hookLevel, CALIBRATION_MAX_DBFS - 1)) answer();
            else window.setTimeout(poll, 20);
          };
          poll();
        }
      })
      .catch(() => {
        setPhase('error');
      });
  };

  const status =
    phase === 'playing'
      ? t('cal.playing')
      : phase === 'tooFast'
        ? t('cal.tooFast')
        : phase === 'reachedTop'
          ? t('cal.reachedTop')
          : '';

  return (
    <PageBody>
      <PageHeading>{t('cal.title')}</PageHeading>
      <p className="mt-2 text-lg">{t('cal.reason')}</p>
      <p className="mt-2">{t('cal.howTo')}</p>
      <div className="mt-6 flex flex-col items-center gap-3">
        {phase === 'error' ? (
          <ErrorPanel
            title={t('error.audio.title')}
            what={t('error.audio.body')}
            tryThis={t('error.audio.try')}
            onRetry={play}
          />
        ) : phase === 'playing' ? (
          <BigButton ref={tapRef} onClick={answer}>
            {t('cal.tap')}
          </BigButton>
        ) : (
          <Button className="text-lg" onClick={play}>
            {phase === 'ready' ? t('cal.start') : t('cal.again')}
          </Button>
        )}
        <StatusLine className="text-center font-semibold">{status}</StatusLine>
      </div>
    </PageBody>
  );
}
