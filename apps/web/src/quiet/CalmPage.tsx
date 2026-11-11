import { useEffect, useState } from 'react';
import { t, type MessageId } from '../copy/en.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { useProfilesLoaded } from '../store/useProfiles.ts';
import { BigButton } from '../ui/BigButton.tsx';
import { Button } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { Chips } from '../ui/Chips.tsx';
import { BackLink, Loading, PageBody, PageHeading } from '../ui/Page.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { Slider } from '../ui/Slider.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { useCalm, type CalmSound, type SleepTimer } from './calmStore.ts';

const SOUNDS: readonly CalmSound[] = ['pink', 'brown', 'white', 'rain', 'ocean', 'tailored'];
const TIMERS: readonly SleepTimer[] = [15, 30, 60, 90, 'night'];
const PITCH_START_HZ = 6000;

function volumeWord(v: number): string {
  if (v < 0.25) return t('calm.volume.verySoft');
  if (v < 0.6) return t('calm.volume.soft');
  if (v < 0.95) return t('calm.volume.medium');
  return t('calm.volume.full');
}

function timeLeft(ms: number): string {
  const m = Math.max(0, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

const isPhone = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

export function CalmPage() {
  const loaded = useProfilesLoaded();
  const load = useCalm((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);
  if (!loaded) return <Loading />;
  return <Calm />;
}

function Calm() {
  const calm = useCalm();
  const profile = useProfileStore((s) => s.active);
  const lc = profile?.calibration?.lcDbfs ?? null;
  const pitch = profile?.ringingPitchHz ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (calm.endsAt === null) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [calm.endsAt]);

  const needsPitch = calm.kind === 'tailored' && pitch === null;
  const playingSound = calm.playing !== null && calm.playing !== 'tone';
  const soundName = (k: CalmSound) => t(`calm.kind.${k}` as MessageId);
  const status = calm.timerEnded
    ? t('calm.timer.done')
    : calm.playing !== null && calm.playing !== 'tone'
      ? t('calm.playing', { sound: soundName(calm.playing) })
      : t('calm.stopped');

  return (
    <PageBody wide>
      <BackLink to="/quiet" label={t('nav.quiet')} />
      <PageHeading className="mt-2">{t('calm.title')}</PageHeading>
      <p className="mt-2 max-w-measure text-lg">{t('calm.lead')}</p>
      <p className="mt-3 max-w-measure rounded-surface border-control border-border-control p-3">
        {t('calm.required')}
      </p>

      <div className="mt-6 grid gap-6 desktop:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col items-start gap-4">
          <BigButton
            aria-pressed={playingSound}
            disabled={!playingSound && needsPitch}
            onClick={() => {
              if (playingSound) calm.stop();
              else void calm.play(calm.kind, pitch ?? PITCH_START_HZ, lc);
            }}
          >
            {playingSound ? t('calm.stop') : t('calm.play')}
          </BigButton>
          <StatusLine className="text-xl font-semibold" data-testid="calm-status">
            {status}
          </StatusLine>
          {calm.error ? (
            <p role="alert" className="font-semibold">
              {t('error.audio.body')} {t('error.audio.try')}
            </p>
          ) : null}
          {isPhone() ? <p className="text-text-muted">{t('calm.phone')}</p> : null}
        </div>

        <div className="flex flex-col gap-5">
          <div>
            <Chips<CalmSound>
              legend={t('calm.kind.legend')}
              value={calm.kind}
              onChange={(k) => {
                calm.setKind(k, pitch ?? PITCH_START_HZ);
              }}
              options={SOUNDS.map((k) => ({ value: k, label: soundName(k) }))}
            />
            {needsPitch ? (
              <p className="mt-1 font-semibold">{t('calm.kind.tailoredNeedsPitch')}</p>
            ) : null}
          </div>
          <Slider
            label={t('calm.volume', { word: volumeWord(calm.volume) })}
            valueText={t('calm.volume', { word: volumeWord(calm.volume) })}
            hint={lc === null ? t('calm.capNoteNoCal') : t('calm.capNote')}
            value={calm.volume}
            min={0}
            max={1}
            step={0.05}
            onChange={calm.setVolume}
          />
          <div>
            <p className="font-semibold">{t('calm.timer.legend')}</p>
            <Segmented<string>
              legend={t('calm.timer.legend')}
              value={String(calm.timer)}
              onChange={(v) => {
                calm.setTimer(v === 'night' ? 'night' : (Number(v) as SleepTimer));
              }}
              options={TIMERS.map((m) => ({
                value: String(m),
                label: t(`calm.timer.${m}` as MessageId),
              }))}
            />
            <StatusLine className="mt-1" data-testid="calm-timer">
              {playingSound
                ? calm.endsAt === null
                  ? t('calm.timer.allNight')
                  : t('calm.timer.left', { time: timeLeft(calm.endsAt - now) })
                : ''}
            </StatusLine>
          </div>
        </div>
      </div>

      <PitchMatch lc={lc} />
    </PageBody>
  );
}

type Step = 'idle' | 'match' | 'octave' | 'done';

function PitchMatch({ lc }: { lc: number | null }) {
  const calm = useCalm();
  const profile = useProfileStore((s) => s.active);
  const save = useProfileStore((s) => s.saveRingingPitch);
  const [step, setStep] = useState<Step>('idle');
  const [hz, setHz] = useState(PITCH_START_HZ);
  const saved = profile?.ringingPitchHz ?? null;

  const move = async (steps: number) => {
    const { pitchStep } = await import('@clearly/audio');
    const next = pitchStep(hz, steps);
    setHz(next);
    await calm.playTone(next, lc);
  };
  const playAt = async (f: number) => {
    const { pitchStep } = await import('@clearly/audio');
    await calm.playTone(pitchStep(f, 0), lc);
  };
  const finish = async (f: number) => {
    const { pitchStep } = await import('@clearly/audio');
    calm.stop();
    await save(pitchStep(f, 0));
    setStep('done');
  };
  const cancel = () => {
    if (calm.playing === 'tone') calm.stop();
    setStep('idle');
  };

  return (
    <Card className="mt-8 max-w-measure" aria-labelledby="pm-title">
      <h2 id="pm-title" className="text-2xl">
        {t('calm.pitch.title')}
      </h2>
      <p className="mt-1">{t('calm.pitch.lead')}</p>
      {saved !== null && step !== 'match' && step !== 'octave' ? (
        <p className="mt-2 font-semibold">{t('calm.pitch.saved', { hz: saved })}</p>
      ) : null}
      {!profile ? (
        <p className="mt-2">{t('calm.pitch.noProfile')}</p>
      ) : step === 'idle' || step === 'done' ? (
        <>
          {step === 'done' ? (
            <p role="status" className="mt-2">
              {t('calm.pitch.done')}
            </p>
          ) : null}
          <Button
            className="mt-3"
            variant={saved === null ? 'primary' : 'secondary'}
            onClick={() => {
              setHz(PITCH_START_HZ);
              setStep('match');
              void calm.playTone(PITCH_START_HZ, lc);
            }}
          >
            {saved === null ? t('calm.pitch.start') : t('calm.pitch.redo')}
          </Button>
        </>
      ) : step === 'match' ? (
        <div className="mt-3">
          <p>{t('calm.pitch.step')}</p>
          <StatusLine className="mt-1 font-semibold" data-testid="pitch-now">
            {t('calm.pitch.now', { hz: Math.round(hz) })}
          </StatusLine>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void move(1)}>
              {t('calm.pitch.higher')}
            </Button>
            <Button variant="secondary" onClick={() => void move(-1)}>
              {t('calm.pitch.lower')}
            </Button>
            <Button
              onClick={() => {
                setStep('octave');
              }}
            >
              {t('calm.pitch.close')}
            </Button>
            <Button variant="quiet" onClick={cancel}>
              {t('calm.pitch.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <p>{t('calm.pitch.octave')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void playAt(hz / 2)}>
              {t('calm.pitch.playLow')}
            </Button>
            <Button variant="secondary" onClick={() => void playAt(hz * 2)}>
              {t('calm.pitch.playHigh')}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void finish(hz / 2)}>{t('calm.pitch.pickLow')}</Button>
            <Button onClick={() => void finish(hz * 2)}>{t('calm.pitch.pickHigh')}</Button>
            <Button variant="secondary" onClick={() => void finish(hz)}>
              {t('calm.pitch.pickNeither', { hz: Math.round(hz) })}
            </Button>
            <Button variant="quiet" onClick={cancel}>
              {t('calm.pitch.cancel')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
