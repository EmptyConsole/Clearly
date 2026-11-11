import type { ProcessingGraph } from '@clearly/audio';
import { useEffect, useState } from 'react';
import { t } from '../copy/en.ts';
import { formatMb, isMeteredConnection } from '../heavy/heavy.ts';
import { cachedRnnoiseModule, downloadRnnoiseModule, rnnoiseInfo } from '../heavy/rnnoise.ts';
import { Button } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { ErrorPanel } from '../ui/ErrorPanel.tsx';
import { ProgressBar } from '../ui/ProgressBar.tsx';
import { Slider } from '../ui/Slider.tsx';
import { Switch } from '../ui/Switch.tsx';
import { levelWord } from './presets.ts';

/** First switch-on default (M06). */
export const CLEANUP_DEFAULT = 0.6;

type Phase = 'checking' | 'needs-download' | 'confirm-metered' | 'downloading' | 'failed' | 'ready';

export function CleanupCard({
  graph,
  sampleRate,
  strength,
  setStrength,
}: {
  graph: ProcessingGraph | null;
  sampleRate: number | null;
  strength: number;
  setStrength: (v: number) => void;
}) {
  const info = rnnoiseInfo();
  const size = formatMb(info.bytes);
  const [phase, setPhase] = useState<Phase>('checking');
  const [progress, setProgress] = useState(0);
  const [voice, setVoice] = useState(false);
  const wrongRate = sampleRate !== null && sampleRate !== 48000;

  useEffect(() => {
    let live = true;
    void cachedRnnoiseModule().then((m) => {
      if (!live) return;
      setPhase(m ? 'ready' : 'needs-download');
    });
    return () => {
      live = false;
    };
  }, []);

  // Once the module is here and a graph is playing, add cleanup to the graph (same latency).
  useEffect(() => {
    if (phase !== 'ready' || !graph || wrongRate || graph.capabilities.backgroundCleanup) return;
    void cachedRnnoiseModule().then((m) => {
      if (m)
        void graph.enableCleanup(m).catch(() => {
          setPhase('failed');
        });
    });
  }, [phase, graph, wrongRate]);

  useEffect(() => {
    if (!graph) return;
    return graph.on('vad', (e) => {
      setVoice(e.probability > 0.5);
    });
  }, [graph]);

  const startDownload = () => {
    setPhase('downloading');
    setProgress(0);
    downloadRnnoiseModule(setProgress)
      .then(() => {
        setPhase('ready');
        setStrength(CLEANUP_DEFAULT);
      })
      .catch(() => {
        setPhase('failed');
      });
  };

  const on = strength > 0;
  return (
    <Card>
      <Switch
        title
        checked={on && phase === 'ready' && !wrongRate}
        onCheckedChange={(v) => {
          if (!v) {
            setStrength(0);
            return;
          }
          if (phase === 'ready') setStrength(CLEANUP_DEFAULT);
          else if (isMeteredConnection()) setPhase('confirm-metered');
          else startDownload();
        }}
        label={t('cleanup.title')}
        hint={t('cleanup.body')}
      />
      {wrongRate ? (
        <p className="mt-2 font-semibold">{t('cleanup.rate', { rate: sampleRate })}</p>
      ) : phase === 'needs-download' ? (
        <div className="mt-3">
          <p>{t('cleanup.download.lead', { size })}</p>
          <Button
            variant="secondary"
            className="mt-2"
            onClick={() => {
              if (isMeteredConnection()) setPhase('confirm-metered');
              else startDownload();
            }}
          >
            {t('cleanup.download.action', { size })}
          </Button>
        </div>
      ) : phase === 'confirm-metered' ? (
        <div className="mt-3" role="alert">
          <p className="font-semibold">{t('cleanup.metered', { size })}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button onClick={startDownload}>{t('cleanup.metered.yes')}</Button>
            <Button
              variant="secondary"
              onClick={() => {
                setPhase('needs-download');
              }}
            >
              {t('cleanup.metered.no')}
            </Button>
          </div>
        </div>
      ) : phase === 'downloading' ? (
        <ProgressBar
          className="mt-3"
          value={Math.round(progress * 100)}
          max={100}
          label={t('cleanup.downloading')}
          valueText={`${Math.round(progress * 100)} %`}
        />
      ) : phase === 'failed' ? (
        <div className="mt-3">
          <ErrorPanel
            title={t('cleanup.failed.title')}
            what={t('cleanup.failed.body')}
            tryThis={t('cleanup.failed.try')}
            onRetry={startDownload}
          />
        </div>
      ) : phase === 'ready' && on ? (
        <>
          <Slider
            className="mt-3"
            label={t('cleanup.slider', {
              word: levelWord(strength),
              n: Math.round(strength * 100),
            })}
            valueText={t('cleanup.slider', {
              word: levelWord(strength),
              n: Math.round(strength * 100),
            })}
            value={strength}
            min={0}
            max={1}
            step={0.05}
            onChange={setStrength}
          />
          <p className="mt-2 inline-flex items-center gap-1" role="status" aria-live="polite">
            <span
              aria-hidden="true"
              className={
                voice
                  ? 'inline-block size-[var(--t-space-1)] rounded-pill bg-primary'
                  : 'inline-block size-[var(--t-space-1)] rounded-pill border-control border-border-control'
              }
            />
            {voice ? t('cleanup.voice.yes') : t('cleanup.voice.no')}
          </p>
        </>
      ) : null}
    </Card>
  );
}
