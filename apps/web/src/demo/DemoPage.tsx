import { resolveSettings } from '@clearly/core';
import type { ProcessingGraph, ProcessingMode } from '@clearly/audio';
import { useEffect, useRef, useState } from 'react';
import { getAudioEngine } from '../audio/AudioEngine.ts';
import { t } from '../copy/en.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { useProfilesLoaded } from '../store/useProfiles.ts';
import { Button, ButtonLink } from '../ui/Button.tsx';
import { ErrorPanel } from '../ui/ErrorPanel.tsx';
import { EstimatedBadge } from '../ui/EstimatedBadge.tsx';
import { Loading, PageBody, PageHeading } from '../ui/Page.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';

// Simple demo-clip page until the full Clear Audio player (M05): the clip through
// buildProcessingGraph with Original | Enhanced.

const CLIP_SECONDS = 14;
type Mode = Extract<ProcessingMode, 'original' | 'enhanced'>;

interface Playing {
  readonly graph: ProcessingGraph;
  readonly source: AudioBufferSourceNode;
}

export function DemoPage() {
  const loaded = useProfilesLoaded();
  const profile = useProfileStore((s) => s.active);
  const [mode, setMode] = useState<Mode>('enhanced');
  const [phase, setPhase] = useState<'stopped' | 'preparing' | 'playing' | 'error'>('stopped');
  const playing = useRef<Playing | null>(null);
  const clip = useRef<AudioBuffer | null>(null);

  const stop = () => {
    const p = playing.current;
    playing.current = null;
    if (p) {
      try {
        p.source.stop();
      } catch {
        // already stopped
      }
      p.graph.dispose();
    }
    setPhase('stopped');
  };

  useEffect(() => stop, []);

  const play = () => {
    const engine = getAudioEngine();
    const started = engine.start();
    setPhase('preparing');
    started
      .then(async () => {
        const ctx = engine.context;
        if (!ctx) throw new Error('no audio context');
        const audio = await import('@clearly/audio');
        if (!clip.current) {
          const [l, r] = audio.syntheticSpeech({
            sampleRate: ctx.sampleRate,
            seconds: CLIP_SECONDS,
          });
          const buf = ctx.createBuffer(2, l.length, ctx.sampleRate);
          buf.copyToChannel(l as Float32Array<ArrayBuffer>, 0);
          buf.copyToChannel(r as Float32Array<ArrayBuffer>, 1);
          clip.current = buf;
        }
        const source = ctx.createBufferSource();
        source.buffer = clip.current;
        source.loop = true;
        const settings = resolveSettings({
          preset: 'movie',
          ...(profile ? { manual: profile.settingsOverrides } : {}),
        });
        const graph = await audio.buildProcessingGraph(ctx, profile, settings, {
          input: source,
          mode,
        });
        source.start();
        playing.current = { graph, source };
        setPhase('playing');
      })
      .catch(() => {
        setPhase('error');
      });
  };

  const changeMode = (m: Mode) => {
    setMode(m);
    playing.current?.graph.setMode(m);
  };

  if (!loaded) return <Loading />;
  const modeLabel = mode === 'enhanced' ? t('demo.enhanced') : t('demo.original');
  return (
    <PageBody>
      <PageHeading>{t('demo.title')}</PageHeading>
      <p className="mt-2 text-lg">{t('demo.lead')}</p>
      <p className="mt-1 text-text-muted">{t('demo.clipNote')}</p>
      {profile?.audiogram.method === 'starter' ? (
        <p className="mt-3">
          <EstimatedBadge />
        </p>
      ) : null}
      {!profile ? (
        <div className="mt-3">
          <p>{t('demo.noProfile')}</p>
          <ButtonLink to="/check" variant="secondary" className="mt-2">
            {t('demo.setUp')}
          </ButtonLink>
        </div>
      ) : null}
      <div className="mt-6 flex flex-col items-start gap-4">
        <Segmented
          legend={t('demo.modeLabel')}
          large
          value={mode}
          onChange={changeMode}
          options={[
            { value: 'original', label: t('demo.original') },
            { value: 'enhanced', label: t('demo.enhanced') },
          ]}
        />
        {phase === 'playing' ? (
          <Button variant="secondary" onClick={stop}>
            {t('demo.stop')}
          </Button>
        ) : (
          <Button onClick={play} disabled={phase === 'preparing'}>
            {t('demo.play')}
          </Button>
        )}
        <StatusLine className="font-semibold">
          {phase === 'playing'
            ? t('demo.nowPlaying', { mode: modeLabel })
            : phase === 'preparing'
              ? t('demo.preparing')
              : phase === 'stopped'
                ? t('demo.stopped')
                : ''}
        </StatusLine>
        {phase === 'error' ? (
          <ErrorPanel
            title={t('error.audio.title')}
            what={t('error.audio.body')}
            tryThis={t('error.audio.try')}
            onRetry={play}
          />
        ) : null}
        <p className="text-text-muted">{t('app.audioPromise')}</p>
      </div>
    </PageBody>
  );
}
