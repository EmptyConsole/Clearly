import { MP3_BITRATES_KBPS, type GraphSettings, type Mp3BitrateKbps } from '@clearly/audio';
import type { Profile } from '@clearly/core';
import { useEffect, useRef, useState } from 'react';
import { t, type MessageId } from '../copy/en.ts';
import { downloadFfmpeg, ffmpegBytes, ffmpegCached } from '../heavy/ffmpeg.ts';
import { formatMb, isMeteredConnection } from '../heavy/heavy.ts';
import { usePlatform } from '../platform/context.ts';
import { Button } from '../ui/Button.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { ProgressBar } from '../ui/ProgressBar.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import {
  BLOB_LIMIT_BYTES,
  canPickSaveLocation,
  estimatedBytes,
  estimateSeconds,
  exportMaxSeconds,
  isPhoneLike,
  outputName,
  runExport,
  saveWithPicker,
  type ExportFormat,
} from './exportJob.ts';
import { formatTime } from './media.ts';
import {
  clearTemp,
  isVideoFile,
  MUX_BYTES_PER_SECOND,
  runVideoExport,
  videoBlocker,
  VideoExportError,
} from './videoExport.ts';
import type { Container } from './videoMux.ts';

/** LGPL-2.1 section 6(d): FFmpeg's source, served next to the core (scripts/ffmpeg-wasm). */
const FFMPEG_SOURCE_URL = '/heavy/ffmpeg/source/index.html';

type Phase = 'setup' | 'running' | 'ready' | 'saved' | 'cancelled' | 'failed';
type Format = ExportFormat | 'video';
type Tool = 'checking' | 'needs-download' | 'confirm-metered' | 'downloading' | 'failed' | 'ready';
type VideoFailure = 'unavailable' | 'no-video' | 'other';

interface Result {
  readonly blob: Blob;
  readonly name: string;
  readonly kind: ExportFormat | Container;
  readonly dropped: number;
}

export function ExportDialog({
  open,
  onOpenChange,
  file,
  durationSeconds,
  profile,
  settings,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  file: File;
  durationSeconds: number;
  profile: Profile | null;
  settings: GraphSettings;
}) {
  const platform = usePlatform();
  const isVideo = isVideoFile(file);
  const blocker = isVideo ? videoBlocker(file, isPhoneLike()) : null;
  const [format, setFormat] = useState<Format>(isVideo && !blocker ? 'video' : 'wav');
  const [kbps, setKbps] = useState<Mp3BitrateKbps>(192);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('setup');
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<'audio' | 'video' | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [tool, setTool] = useState<Tool>('checking');
  const [toolProgress, setToolProgress] = useState(0);
  const [videoFailure, setVideoFailure] = useState<VideoFailure | null>(null);
  const abort = useRef<AbortController | null>(null);
  const video = format === 'video';
  const max = exportMaxSeconds();
  const tooLong = durationSeconds > max;
  const tooBig =
    !video &&
    !canPickSaveLocation() &&
    estimatedBytes(format, durationSeconds, kbps) > BLOB_LIMIT_BYTES;
  const muxSeconds = file.size / MUX_BYTES_PER_SECOND;
  const toolSize = formatMb(ffmpegBytes());

  useEffect(() => {
    if (!open || tooLong) return;
    let live = true;
    estimateSeconds(file, profile, settings, durationSeconds)
      .then((s) => {
        if (live) setEstimate(s);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, file, profile, settings, durationSeconds, tooLong]);

  // The finished video may wait in OPFS until it is saved; remove it when the dialog goes.
  useEffect(
    () => () => {
      if (isVideo) void clearTemp();
    },
    [isVideo],
  );

  useEffect(() => {
    if (!isVideo) return;
    let live = true;
    void ffmpegCached().then((c) => {
      if (live) setTool(c ? 'ready' : 'needs-download');
    });
    return () => {
      live = false;
    };
  }, [isVideo]);

  const getTool = () => {
    setTool('downloading');
    setToolProgress(0);
    downloadFfmpeg(setToolProgress)
      .then(() => {
        setTool('ready');
      })
      .catch(() => {
        setTool('failed');
      });
  };

  const audioInstead = () => {
    setFormat('wav');
    setVideoFailure(null);
    setPhase('setup');
  };

  const start = () => {
    const ac = new AbortController();
    abort.current = ac;
    setPhase('running');
    setProgress(0);
    setVideoFailure(null);
    if (video) {
      setStep('audio');
      void clearTemp()
        .then(() =>
          runVideoExport({
            file,
            profile,
            settings,
            signal: ac.signal,
            onProgress: setProgress,
            onStep: setStep,
            ...(estimate !== null ? { estimate: { render: estimate, mux: muxSeconds } } : {}),
          }),
        )
        .then((r) => {
          setResult({
            blob: r.blob,
            name: r.name,
            kind: r.plan.container,
            dropped: r.plan.droppedSubtitles,
          });
          setPhase('ready');
        })
        .catch((e: unknown) => {
          if (ac.signal.aborted) {
            setPhase('cancelled');
            return;
          }
          // Development builds: the reason and ffmpeg's last lines, for debugging.
          if (import.meta.env.DEV)
            console.error(
              'video export failed',
              String(e),
              e instanceof VideoExportError ? e.log.join('\n') : '',
            );
          setVideoFailure(
            e instanceof VideoExportError && e.reason === 'no-video'
              ? 'no-video'
              : e instanceof Error && e.name === 'FfmpegUnavailableError'
                ? 'unavailable'
                : 'other',
          );
          setPhase('failed');
        });
      return;
    }
    setStep(null);
    runExport({
      file,
      format,
      bitrateKbps: kbps,
      profile,
      settings,
      signal: ac.signal,
      onProgress: setProgress,
    })
      .then((blob) => {
        setResult({ blob, name: outputName(file.name, format), kind: format, dropped: 0 });
        setPhase('ready');
      })
      .catch(() => {
        setPhase(ac.signal.aborted ? 'cancelled' : 'failed');
      });
  };

  const save = () => {
    if (!result) return;
    const done = () => {
      setPhase('saved');
    };
    if (canPickSaveLocation()) {
      saveWithPicker(result.blob, result.name, result.kind)
        .then((ok) => {
          if (ok) done();
        })
        .catch(() => {
          setPhase('failed');
        });
    } else {
      void platform
        .saveFile(result.blob, { suggestedName: result.name, mimeType: result.blob.type })
        .then(done);
    }
  };

  const strength = Math.round(settings.strength * 100);
  const formatOptions: { value: Format; label: string }[] = [
    ...(isVideo && !blocker ? [{ value: 'video' as const, label: t('export.video') }] : []),
    { value: 'wav', label: t('export.wav') },
    { value: 'mp3', label: t('export.mp3') },
  ];
  const needsTool = video && tool !== 'ready';
  const total = estimate === null ? null : video ? estimate + muxSeconds : estimate;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          abort.current?.abort();
          if (isVideo) void clearTemp();
        }
        onOpenChange(o);
      }}
      title={t('export.title')}
      description={t('export.lead')}
    >
      <div className="flex flex-col gap-4">
        <p>
          {t('export.settings', {
            preset: t(`player.preset.${settings.preset}` as MessageId),
            strength,
            vf: Math.round(settings.voiceFocus * 100),
            limit: settings.loudestLimitDbfs,
          })}
        </p>
        {tooLong ? (
          <p className="font-semibold">{t('export.tooLong', { max: formatTime(max) })}</p>
        ) : phase === 'setup' ? (
          <>
            <div>
              <p className="mb-1 font-semibold">{t('export.format')}</p>
              <Segmented<Format>
                legend={t('export.format')}
                value={format}
                onChange={setFormat}
                options={formatOptions}
              />
              {blocker ? (
                <p className="mt-1 font-semibold">
                  {blocker === 'phone' ? t('export.video.phone') : t('export.video.tooBig')}
                </p>
              ) : null}
            </div>
            {video ? <p className="text-text-muted">{t('export.video.note')}</p> : null}
            {video && tool === 'needs-download' ? (
              <div>
                <p>{t('export.video.download.lead', { size: toolSize })}</p>
                <p className="mt-1 text-text-muted">
                  {t('export.video.licence')}{' '}
                  <a href={FFMPEG_SOURCE_URL} target="_blank" rel="noopener">
                    {t('export.video.source')}
                  </a>
                </p>
                <Button
                  variant="secondary"
                  className="mt-2"
                  onClick={() => {
                    if (isMeteredConnection()) setTool('confirm-metered');
                    else getTool();
                  }}
                >
                  {t('export.video.download.action', { size: toolSize })}
                </Button>
              </div>
            ) : video && tool === 'confirm-metered' ? (
              <div role="alert">
                <p className="font-semibold">{t('export.video.metered', { size: toolSize })}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button onClick={getTool}>{t('export.video.metered.yes')}</Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setTool('needs-download');
                    }}
                  >
                    {t('export.video.metered.no')}
                  </Button>
                </div>
              </div>
            ) : video && tool === 'downloading' ? (
              <ProgressBar
                value={Math.round(toolProgress * 100)}
                max={100}
                label={t('export.video.downloading')}
                valueText={`${Math.round(toolProgress * 100)} %`}
              />
            ) : video && tool === 'failed' ? (
              <div role="alert">
                <p className="font-semibold">{t('export.video.downloadFailed')}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={getTool}>
                    {t('error.tryAgain')}
                  </Button>
                  <Button variant="secondary" onClick={audioInstead}>
                    {t('export.video.useAudio')}
                  </Button>
                </div>
              </div>
            ) : null}
            {format === 'mp3' ? (
              <div>
                <p className="mb-1 font-semibold">{t('export.bitrate')}</p>
                <Segmented<string>
                  legend={t('export.bitrate')}
                  value={String(kbps)}
                  onChange={(v) => {
                    setKbps(Number(v) as Mp3BitrateKbps);
                  }}
                  options={MP3_BITRATES_KBPS.map((k) => ({
                    value: String(k),
                    label: t('export.kbps', { n: k }),
                  }))}
                />
                <p className="mt-1 text-text-muted">{t('export.mp3Note')}</p>
              </div>
            ) : null}
            <StatusLine>
              {total === null
                ? t('export.estimating')
                : t('export.estimate', { time: formatTime(total) })}
            </StatusLine>
            {tooBig ? <p className="font-semibold">{t('export.tooBig')}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={start} disabled={tooBig || needsTool}>
                {t('export.start')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  onOpenChange(false);
                }}
              >
                {t('export.close')}
              </Button>
            </div>
          </>
        ) : phase === 'running' ? (
          <>
            {step ? (
              <p className="font-semibold">
                {step === 'audio' ? t('export.step.audio') : t('export.step.video')}
              </p>
            ) : null}
            <ProgressBar
              value={Math.round(progress * 100)}
              max={100}
              label={t('export.progress')}
              valueText={
                step
                  ? `${Math.round(progress * 100)} %`
                  : t('export.progressValue', {
                      done: formatTime(progress * durationSeconds),
                      total: formatTime(durationSeconds),
                    })
              }
            />
            <Button variant="secondary" onClick={() => abort.current?.abort()}>
              {t('export.cancel')}
            </Button>
          </>
        ) : phase === 'ready' ? (
          <>
            <StatusLine>{t('export.ready')}</StatusLine>
            {result && result.dropped > 0 ? (
              <p>
                {result.dropped === 1
                  ? t('export.video.dropped.one')
                  : t('export.video.dropped.many', { n: result.dropped })}
              </p>
            ) : null}
            <Button onClick={save}>{t('export.save')}</Button>
          </>
        ) : (
          <>
            <StatusLine>
              {phase === 'saved'
                ? t('export.done', { name: result?.name ?? '' })
                : phase === 'cancelled'
                  ? t('export.cancelled')
                  : videoFailure === 'unavailable'
                    ? t('export.video.unavailable')
                    : videoFailure === 'no-video'
                      ? t('export.video.noVideo')
                      : videoFailure
                        ? `${t('export.video.failed')} ${t('export.video.failedTry')}`
                        : `${t('export.failed')} ${t('export.failedTry')}`}
            </StatusLine>
            <div className="flex flex-wrap gap-2">
              {phase !== 'saved' && videoFailure !== 'no-video' ? (
                <Button
                  onClick={() => {
                    setPhase('setup');
                  }}
                >
                  {t('error.tryAgain')}
                </Button>
              ) : null}
              {videoFailure ? (
                <Button variant="secondary" onClick={audioInstead}>
                  {t('export.video.useAudio')}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                onClick={() => {
                  onOpenChange(false);
                }}
              >
                {t('export.close')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
