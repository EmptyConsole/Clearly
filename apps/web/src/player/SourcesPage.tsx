import { expectedDurationSeconds } from '@clearly/core';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getAudioEngine } from '../audio/AudioEngine.ts';
import { t } from '../copy/en.ts';
import { usePlatform } from '../platform/context.ts';
import type { AudioSourceDescriptor } from '../platform/types.ts';
import { kv } from '../storage/repos.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { useProfilesLoaded } from '../store/useProfiles.ts';
import { Button, ButtonLink } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { ErrorPanel } from '../ui/ErrorPanel.tsx';
import { Loading, PageBody, PageHeading } from '../ui/Page.tsx';
import { ProfileSelector } from '../ui/ProfileSelector.tsx';
import { Switch } from '../ui/Switch.tsx';
import { cx } from '../ui/cx.ts';
import { usePlayerStore } from './playerStore.ts';
import { isCancel, NoAudioSharedError, startTabCapture } from './tabCapture.ts';
import { CoachStep, FileArt } from './CoachArt.tsx';

const coarseOnly = (): boolean =>
  window.matchMedia('(pointer: coarse)').matches &&
  !window.matchMedia('(any-pointer: fine)').matches;

export function SourcesPage() {
  const loaded = useProfilesLoaded();
  const platform = usePlatform();
  const navigate = useNavigate();
  const active = useProfileStore((s) => s.active);
  const setSource = usePlayerStore((s) => s.setSource);
  const [sources, setSources] = useState<readonly AudioSourceDescriptor[] | null>(null);
  const [withoutProfile, setWithoutProfile] = useState(false);
  const [params] = useSearchParams();
  // Home's "Enhance a tab again" opens the coach (and from it the picker) straight away.
  const [coach, setCoach] = useState(() => params.get('tab') === '1');
  const [hideCoach, setHideCoach] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);
  const [phoneInfo, setPhoneInfo] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void platform.listAudioSources().then((s) => {
      if (live) setSources(s);
    });
    void kv.get('tabCoachHidden').then((v) => {
      if (live) setHideCoach(v === true);
    });
    return () => {
      live = false;
    };
  }, [platform]);

  if (!loaded || !sources) return <Loading />;

  const openFile = (file: File | undefined) => {
    if (!file) return;
    // The click or drop is the gesture that lets sound start.
    void getAudioEngine()
      .start()
      .catch(() => undefined);
    setSource({ kind: 'file', file });
    navigate('/audio/player');
  };

  const openDemo = () => {
    void getAudioEngine()
      .start()
      .catch(() => undefined);
    setSource({ kind: 'demo' });
    navigate('/audio/player');
  };

  // Desktop app (M12): all computer sound through loopback capture.
  const pickSystem = () => {
    setTabError(null);
    void getAudioEngine()
      .start()
      .catch(() => undefined);
    platform
      .startCapture({ kind: 'system', id: 'system' })
      .then((stream) => {
        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack) throw new NoAudioSharedError('no audio track');
        setSource({
          kind: 'tab',
          capture: { stream, audioTrack, title: null, suppressed: false, via: 'system' },
        });
        navigate('/audio/player');
      })
      .catch((e: unknown) => {
        if (isCancel(e)) return;
        setTabError(t('source.system.failed'));
      });
  };

  const pickTab = () => {
    setCoach(false);
    setTabError(null);
    void getAudioEngine()
      .start()
      .catch(() => undefined);
    startTabCapture()
      .then((capture) => {
        setSource({ kind: 'tab', capture });
        navigate('/audio/player');
      })
      .catch((e: unknown) => {
        if (isCancel(e)) return; // The person cancelled: no error.
        setTabError(e instanceof NoAudioSharedError ? t('tab.noAudio') : t('tab.failed'));
      });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    openFile(e.dataTransfer.files[0]);
  };

  if (!active && !withoutProfile) {
    return (
      <PageBody>
        <PageHeading>{t('audio.title')}</PageHeading>
        <Card className="mt-6">
          <h2 className="text-2xl">{t('audio.noProfile.title')}</h2>
          <p className="mt-2">
            {t('audio.noProfile.body', { n: expectedDurationSeconds('starter', 'normal') })}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink to="/check/starter">{t('audio.noProfile.quick')}</ButtonLink>
            <Button
              variant="secondary"
              onClick={() => {
                setWithoutProfile(true);
              }}
            >
              {t('audio.noProfile.later')}
            </Button>
          </div>
        </Card>
      </PageBody>
    );
  }

  const hasTab = sources.some((s) => s.kind === 'tab');
  const hasSystem = sources.some((s) => s.kind === 'system');
  const desktop = platform.kind === 'desktop';
  return (
    <PageBody wide>
      <PageHeading>{t('audio.title')}</PageHeading>
      <p className="mt-2 max-w-measure text-lg">{t('audio.lead')}</p>
      <div className="mt-4 max-w-measure">
        <ProfileSelector />
      </div>
      <ul className="mt-6 grid gap-3 desktop:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {[...sources]
          .sort((a, b) => (a.kind === 'file' ? -1 : b.kind === 'file' ? 1 : 0))
          .map((s) => (
            <li key={s.id} className={cx('flex', s.kind === 'file' && 'desktop:row-span-2')}>
              {s.kind === 'demo' ? (
                <Card className="flex w-full flex-col">
                  <h2 className="text-2xl">{t('source.demo.title')}</h2>
                  <p className="mt-1 flex-1">{t('source.demo.body')}</p>
                  <Button className="mt-3 self-start" onClick={openDemo}>
                    {t('source.open')}
                  </Button>
                </Card>
              ) : s.kind === 'file' ? (
                <Card
                  className={cx(
                    'flex w-full flex-col border-control border-dashed border-border-control tablet:p-6',
                    dragging && 'border-primary bg-surface-sunken',
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => {
                    setDragging(false);
                  }}
                  onDrop={onDrop}
                  data-testid="file-drop"
                >
                  <FileArt />
                  <h2 className="mt-3 text-3xl">{t('source.file.title')}</h2>
                  <p className="mt-1 flex-1 text-lg">
                    {dragging ? t('source.file.drop') : t('source.file.body')}
                  </p>
                  <Button className="mt-3 self-start" onClick={() => fileRef.current?.click()}>
                    {t('source.file.choose')}
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="audio/*,video/*"
                    className="sr-only"
                    tabIndex={-1}
                    aria-label={t('source.file.choose')}
                    data-testid="file-input"
                    onChange={(e) => {
                      openFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </Card>
              ) : s.kind === 'system' ? (
                <Card className="flex w-full flex-col">
                  <h2 className="text-2xl">{t('source.system.title')}</h2>
                  <p className="mt-1 flex-1">{t('source.system.body')}</p>
                  <Button className="mt-3 self-start" onClick={pickSystem}>
                    {t('source.system.start')}
                  </Button>
                </Card>
              ) : s.kind === 'cable' ? (
                <Card className="flex w-full flex-col">
                  <h2 className="text-2xl">{t('source.cable.title')}</h2>
                  <p className="mt-1 flex-1">{t('source.cable.body')}</p>
                  {!hasSystem ? <p className="mt-1">{t('source.cable.only')}</p> : null}
                  <ButtonLink to="/audio/cable" className="mt-3 self-start">
                    {t('source.cable.start')}
                  </ButtonLink>
                </Card>
              ) : (
                <Card className="flex w-full flex-col">
                  <h2 className="text-2xl">{t('source.tab.title')}</h2>
                  <p className="mt-1 flex-1">{t('source.tab.body')}</p>
                  <Button
                    className="mt-3 self-start"
                    onClick={() => {
                      if (hideCoach) pickTab();
                      else setCoach(true);
                    }}
                  >
                    {t('source.tab.start')}
                  </Button>
                </Card>
              )}
            </li>
          ))}
      </ul>
      {tabError ? (
        <div className="mt-4">
          <ErrorPanel
            title={tabError}
            what={tabError}
            tryThis={desktop ? t('source.system.failedTry') : t('tab.failedTry')}
            onRetry={desktop ? pickSystem : pickTab}
          />
        </div>
      ) : null}
      {!hasTab && !desktop ? (
        coarseOnly() ? (
          <Card className="mt-4 bg-surface">
            <h2 className="text-xl">{t('source.phone.title')}</h2>
            <Button
              variant="secondary"
              className="mt-2"
              onClick={() => {
                setPhoneInfo(true);
              }}
            >
              {t('source.phone.more')}
            </Button>
          </Card>
        ) : (
          <Card className="mt-4 bg-surface" data-testid="no-tab">
            <h2 className="text-xl">{t('source.noTab.title')}</h2>
            <p className="mt-1">{t('source.noTab.body')}</p>
          </Card>
        )
      ) : null}
      <Dialog
        open={phoneInfo}
        onOpenChange={setPhoneInfo}
        title={t('source.phone.title')}
        description={t('source.phone.body')}
      >
        <Button
          onClick={() => {
            setPhoneInfo(false);
          }}
        >
          {t('settings.close')}
        </Button>
      </Dialog>
      <Dialog open={coach} onOpenChange={setCoach} title={t('tab.coach.title')}>
        <ol className="flex flex-col gap-3">
          {(['tab.coach.step1', 'tab.coach.step2', 'tab.coach.step3'] as const).map((k, i) => (
            <li key={k} className="flex items-center gap-3">
              <CoachStep step={i + 1} />
              <span>{t(k)}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4">
          <Switch
            checked={hideCoach}
            onCheckedChange={(v) => {
              setHideCoach(v);
              void kv.set('tabCoachHidden', v);
            }}
            label={t('tab.coach.dontShow')}
          />
        </div>
        <Button className="mt-4" onClick={pickTab}>
          {t('tab.coach.continue')}
        </Button>
      </Dialog>
    </PageBody>
  );
}
