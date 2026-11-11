import { useEffect, useState } from 'react';
import { SKIP_SECONDS as SKIP } from './media.ts';
import { t } from '../copy/en.ts';
import { Button } from '../ui/Button.tsx';
import { Slider } from '../ui/Slider.tsx';
import { formatTime, seekBy, seekTo, setSpeed, setVolume, togglePlay } from './media.ts';

/** Custom transport for a media element: play/pause, back and forward 10 s, seek, volume, speed. */
export function Transport({ media }: { media: HTMLMediaElement }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => {
      setTick((n) => n + 1);
    };
    const events = [
      'timeupdate',
      'play',
      'pause',
      'durationchange',
      'progress',
      'volumechange',
      'ratechange',
    ];
    for (const e of events) media.addEventListener(e, bump);
    return () => {
      for (const e of events) media.removeEventListener(e, bump);
    };
  }, [media]);

  const duration = Number.isFinite(media.duration) ? media.duration : 0;
  const buffered = media.buffered.length > 0 ? media.buffered.end(media.buffered.length - 1) : 0;
  const paused = media.paused;
  return (
    <div className="flex flex-col gap-3" data-controls>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            seekBy(media, -SKIP);
          }}
        >
          {t('transport.back')}
        </Button>
        <Button
          className="min-w-[calc(var(--t-target-min)*2.5)]"
          onClick={() => {
            togglePlay(media);
          }}
        >
          {paused ? t('transport.play') : t('transport.pause')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            seekBy(media, SKIP);
          }}
        >
          {t('transport.forward')}
        </Button>
      </div>
      <div>
        <Slider
          label={`${t('transport.seek')}: ${t('transport.time', { now: formatTime(media.currentTime), total: formatTime(duration) })}`}
          value={media.currentTime}
          min={0}
          max={Math.max(duration, 0.01)}
          step={1}
          valueText={t('transport.time', {
            now: formatTime(media.currentTime),
            total: formatTime(duration),
          })}
          onChange={(v) => {
            seekTo(media, v);
          }}
        />
        <div
          aria-hidden="true"
          className="mt-0.5 h-[var(--t-space-0-5)] w-full max-w-measure rounded-pill bg-surface-sunken"
        >
          <div
            className="h-full rounded-pill bg-border"
            style={{ width: `${duration > 0 ? (buffered / duration) * 100 : 0}%` }}
          />
        </div>
      </div>
      <div className="grid gap-3 tablet:grid-cols-2">
        <Slider
          label={t('transport.volume', { n: Math.round(media.volume * 100) })}
          value={media.volume}
          min={0}
          max={1}
          step={0.05}
          valueText={t('transport.volume', { n: Math.round(media.volume * 100) })}
          onChange={(v) => {
            setVolume(media, v);
          }}
        />
        <Slider
          label={t('transport.speed', { n: media.playbackRate.toFixed(2) })}
          value={media.playbackRate}
          min={0.75}
          max={1.5}
          step={0.05}
          valueText={t('transport.speed', { n: media.playbackRate.toFixed(2) })}
          onChange={(v) => {
            setSpeed(media, v);
          }}
        />
      </div>
      <p className="text-sm text-text-muted">{t('transport.keys')}</p>
    </div>
  );
}
