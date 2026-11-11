import { clockTime, toSrt, toVtt, type Cue } from '@clearly/core';
import { useEffect, useState } from 'react';
import { t, type MessageId } from '../copy/en.ts';
import { formatMb, isMeteredConnection } from '../heavy/heavy.ts';
import { usePlatform } from '../platform/context.ts';
import { Button } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { ErrorPanel } from '../ui/ErrorPanel.tsx';
import { ProgressBar } from '../ui/ProgressBar.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { Slider } from '../ui/Slider.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { Switch } from '../ui/Switch.tsx';
import { downloadModel, isModelDownloaded, modelBytes, type CaptionModel } from './assets.ts';
import type { CaptionDisplay, CaptionScheme } from './display.ts';
import type { CaptionStatus } from './session.ts';

export type CaptionMode = 'off' | 'video' | 'always';
type Dl = 'checking' | 'needed' | 'metered' | 'downloading' | 'failed' | 'ready';

export function CaptionsCard(p: {
  mode: CaptionMode;
  setMode: (m: CaptionMode) => void;
  model: CaptionModel;
  setModel: (m: CaptionModel) => void;
  onReady: (ready: boolean) => void;
  status: CaptionStatus | null;
  waiting: boolean;
  captionsFirst: boolean;
  setCaptionsFirst: (v: boolean) => void;
  cues: readonly Cue[];
  baseName: string;
  display: CaptionDisplay;
  setDisplay: (d: CaptionDisplay) => void;
  floatingSupported: boolean;
  floatingOpen: boolean;
  toggleFloating: () => void;
}) {
  const platform = usePlatform();
  const [dl, setDl] = useState<Dl>('checking');
  const [progress, setProgress] = useState(0);
  const { model, onReady } = p;
  const size = formatMb(modelBytes(model));

  useEffect(() => {
    let live = true;
    void isModelDownloaded(model).then((ok) => {
      if (!live) return;
      setDl(ok ? 'ready' : 'needed');
      onReady(ok);
    });
    return () => {
      live = false;
    };
  }, [model, onReady]);

  const start = () => {
    setDl('downloading');
    setProgress(0);
    downloadModel(model, setProgress)
      .then(() => {
        setDl('ready');
        onReady(true);
      })
      .catch(() => {
        setDl('failed');
      });
  };

  const save = (format: 'srt' | 'vtt') => {
    const text = format === 'srt' ? toSrt(p.cues) : toVtt(p.cues);
    const blob = new Blob([text], { type: format === 'srt' ? 'application/x-subrip' : 'text/vtt' });
    void platform.saveFile(blob, { suggestedName: `${p.baseName}.${format}`, mimeType: blob.type });
  };

  const s = p.status;
  return (
    <Card>
      <h3 className="text-xl font-semibold">{t('captions.title')}</h3>
      <p className="mt-1 text-text-muted">{t('captions.body')}</p>
      <div className="mt-3">
        <Segmented<CaptionMode>
          legend={t('captions.mode.legend')}
          value={p.mode}
          onChange={p.setMode}
          options={(['off', 'video', 'always'] as const).map((m) => ({
            value: m,
            label: t(`captions.mode.${m}` as MessageId),
          }))}
        />
      </div>
      <label className="mt-3 flex flex-col gap-1">
        <span className="font-semibold">{t('captions.model')}</span>
        <select
          value={model}
          onChange={(e) => {
            p.setModel(e.target.value as CaptionModel);
          }}
          className="min-h-[var(--t-target-input-height)] w-full max-w-measure rounded-control border-control border-border-control bg-surface-raised px-2"
        >
          {(['standard', 'accurate'] as const).map((m) => (
            <option key={m} value={m}>
              {t('captions.model.option', {
                name: t(`captions.model.${m}` as MessageId),
                mb: formatMb(modelBytes(m)),
              })}
            </option>
          ))}
        </select>
        <span className="text-sm text-text-muted">{t('captions.model.hint')}</span>
      </label>

      {p.mode !== 'off' ? (
        dl === 'needed' ? (
          <div className="mt-3">
            <p>
              {t('captions.download.lead', {
                standard: formatMb(modelBytes('standard')),
                accurate: formatMb(modelBytes('accurate')),
              })}
            </p>
            <Button
              className="mt-2"
              onClick={() => {
                if (isMeteredConnection()) setDl('metered');
                else start();
              }}
            >
              {t('captions.download.action', { size })}
            </Button>
          </div>
        ) : dl === 'metered' ? (
          <div className="mt-3" role="alert">
            <p className="font-semibold">{t('captions.metered', { size })}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button onClick={start}>{t('cleanup.metered.yes')}</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setDl('needed');
                }}
              >
                {t('cleanup.metered.no')}
              </Button>
            </div>
          </div>
        ) : dl === 'downloading' ? (
          <ProgressBar
            className="mt-3"
            value={Math.round(progress * 100)}
            max={100}
            label={t('captions.downloading')}
            valueText={`${Math.round(progress * 100)} %`}
          />
        ) : dl === 'failed' ? (
          <div className="mt-3">
            <ErrorPanel
              title={t('captions.failed.title')}
              what={t('captions.failed.body')}
              tryThis={t('captions.failed.try')}
              onRetry={start}
            />
          </div>
        ) : dl === 'ready' ? (
          <div className="mt-3 flex flex-col gap-3">
            {s?.phase === 'error' ? (
              <ErrorPanel
                title={t('captions.error.title')}
                what={t('captions.error.body')}
                tryThis={t('captions.error.try')}
              />
            ) : null}
            <StatusLine>
              {!s || s.phase === 'loading'
                ? t('captions.loading')
                : s.live
                  ? s.skipped
                    ? t('captions.skipped')
                    : t('captions.liveLag')
                  : s.phase === 'complete'
                    ? t('captions.complete')
                    : t('captions.progress', {
                        ready: clockTime(s.readySeconds),
                        total: clockTime(s.durationSeconds),
                      })}
            </StatusLine>
            {s?.fallback ? <p>{t('captions.liveFallback')}</p> : null}
            {p.waiting ? <p className="font-semibold">{t('captions.waiting')}</p> : null}
            {s && !s.live ? (
              <Switch
                checked={p.captionsFirst}
                onCheckedChange={p.setCaptionsFirst}
                label={t('captions.first')}
                hint={t('captions.firstHint')}
              />
            ) : null}
            {s?.device ? (
              <p className="text-sm text-text-muted">
                {t(`captions.device.${s.device}` as MessageId)}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {p.floatingSupported ? (
                <Button variant="secondary" onClick={p.toggleFloating}>
                  {p.floatingOpen ? t('captions.floatClose') : t('captions.float')}
                </Button>
              ) : null}
              {p.cues.length > 0 && !s?.live ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      save('srt');
                    }}
                  >
                    {t('captions.saveSrt')}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      save('vtt');
                    }}
                  >
                    {t('captions.saveVtt')}
                  </Button>
                </>
              ) : null}
            </div>
            {p.floatingSupported ? (
              <p className="text-sm text-text-muted">{t('captions.floatHint')}</p>
            ) : null}
            <details>
              <summary className="cursor-pointer font-semibold">{t('captions.display')}</summary>
              <div className="mt-2 flex flex-col gap-3">
                <Slider
                  label={t('captions.size', { n: p.display.size })}
                  valueText={t('captions.size', { n: p.display.size })}
                  value={p.display.size}
                  min={18}
                  max={64}
                  step={2}
                  onChange={(v) => {
                    p.setDisplay({ ...p.display, size: v });
                  }}
                />
                <Slider
                  label={t('captions.lines', { n: p.display.lines })}
                  valueText={t('captions.lines', { n: p.display.lines })}
                  value={p.display.lines}
                  min={1}
                  max={3}
                  step={1}
                  onChange={(v) => {
                    p.setDisplay({ ...p.display, lines: v });
                  }}
                />
                <Segmented<CaptionScheme>
                  legend={t('captions.scheme')}
                  value={p.display.scheme}
                  onChange={(v) => {
                    p.setDisplay({ ...p.display, scheme: v });
                  }}
                  options={(['white', 'yellow', 'dark'] as const).map((sc) => ({
                    value: sc,
                    label: t(`captions.scheme.${sc}` as MessageId),
                  }))}
                />
              </div>
            </details>
          </div>
        ) : null
      ) : null}
    </Card>
  );
}
