import type { ProcessingMode } from '@clearly/audio';
import { useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '../audio/AudioEngine.ts';
import { t } from '../copy/en.ts';
import { demoClipUrl } from '../player/demoClip.ts';
import { useAppSettings } from '../store/appSettingsStore.ts';
import { PlayerSession } from '../player/session.ts';
import { playerSettings } from '../player/settings.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { Button } from '../ui/Button.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';

/** The demo clip with a big Original | Enhanced control, for the first-run flow. */
export function DemoListen() {
  const profile = useProfileStore((s) => s.active);
  const [url, setUrl] = useState<string | null>(null);
  const [el, setEl] = useState<HTMLAudioElement | null>(null);
  const [mode, setMode] = useState<ProcessingMode>('enhanced');
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const session = useRef<PlayerSession | null>(null);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
    session.current?.graph.setMode(mode);
  }, [mode]);

  useEffect(() => {
    void demoClipUrl().then(setUrl);
    return () => {
      session.current?.dispose();
      session.current = null;
    };
  }, []);

  const toggle = async () => {
    if (!el) return;
    if (!el.paused) {
      el.pause();
      setPlaying(false);
      return;
    }
    try {
      const engine = getAudioEngine();
      const started = engine.start();
      if (!session.current) {
        await started;
        session.current = await PlayerSession.create(
          engine,
          { kind: 'element', element: el },
          profile,
          playerSettings(profile, useAppSettings.getState().settings, {}),
          modeRef.current,
        );
      }
      await el.play();
      setPlaying(true);
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {url ? <audio ref={setEl} src={url} preload="auto" loop /> : null}
      <Segmented<ProcessingMode>
        legend={t('player.mode.legend')}
        large
        value={mode}
        onChange={setMode}
        options={[
          { value: 'original', label: t('player.mode.original') },
          { value: 'enhanced', label: t('player.mode.enhanced') },
        ]}
      />
      <div>
        <Button disabled={!el} onClick={() => void toggle()}>
          {playing ? t('welcome.hear.pause') : t('welcome.hear.play')}
        </Button>
      </div>
      <StatusLine className="font-semibold">
        {playing
          ? t('player.mode.now', {
              mode: mode === 'original' ? t('player.mode.original') : t('player.mode.enhanced'),
            })
          : ''}
      </StatusLine>
      {failed ? (
        <p role="alert" className="font-semibold">
          {t('error.audio.body')} {t('error.audio.try')}
        </p>
      ) : null}
    </div>
  );
}
