import { boostShare, type AutoBoostSensitivity } from '@clearly/core';
import { useEffect } from 'react';
import { t, type MessageId } from '../copy/en.ts';
import { Button } from '../ui/Button.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { ErrorPanel } from '../ui/ErrorPanel.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { useAutoBoost } from './autoBoostStore.ts';

/** Meter range in dBFS: a quiet room reads near the left, a very loud one at the right. */
const METER_MIN = -75;
const METER_MAX = -20;

function roomWord(roomDbfs: number | null, s: AutoBoostSensitivity): MessageId {
  if (roomDbfs === null) return 'auto.word.quiet';
  const share = boostShare(roomDbfs, s);
  if (share <= 0) return 'auto.word.quiet';
  if (share < 0.4) return 'auto.word.some';
  if (share < 0.8) return 'auto.word.noisy';
  return 'auto.word.very';
}

/**
 * Auto Boost's controls: the headphones step, the microphone pre-prompt, the live room meter, the
 * readout, Sensitivity, and the feedback-guard pause. Used on the Auto Boost page and in Clear
 * Audio, so it can be set up without leaving the player.
 */
export function AutoBoostControls({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const s = useAutoBoost();
  const { loadSensitivity } = s;
  useEffect(() => {
    void loadSensitivity();
  }, [loadSensitivity]);
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const room = s.reading.roomDbfs;
  const pct =
    room === null
      ? 0
      : Math.round(
          ((Math.min(METER_MAX, Math.max(METER_MIN, room)) - METER_MIN) / (METER_MAX - METER_MIN)) *
            100,
        );
  const word = t(roomWord(room, s.sensitivity));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {s.phase === 'on' ? (
          <Button variant="secondary" onClick={s.stop}>
            {t('auto.stop')}
          </Button>
        ) : s.phase === 'off' ? (
          <Button onClick={s.begin}>{t('auto.start')}</Button>
        ) : null}
        <Button variant="quiet" onClick={s.openHeadphonesInfo}>
          <span
            aria-hidden="true"
            className="mr-1 inline-flex size-[var(--t-space-3)] items-center justify-center rounded-pill border-control border-current text-sm font-bold"
          >
            i
          </span>
          {t('auto.headphones.info')}
        </Button>
      </div>

      {s.phase === 'mic' || s.phase === 'starting' ? (
        <section
          className="rounded-surface border-control border-primary p-3"
          aria-labelledby="ab-mic"
        >
          <H id="ab-mic" className="text-xl">
            {t('auto.mic.title')}
          </H>
          <p className="mt-1">{t('auto.mic.body')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={s.phase === 'starting'}
              onClick={() => {
                void s.allowMic();
              }}
            >
              {t('auto.mic.continue')}
            </Button>
            <Button variant="secondary" onClick={s.cancelMic}>
              {t('auto.mic.cancel')}
            </Button>
          </div>
        </section>
      ) : null}

      {s.phase === 'denied' ? (
        <ErrorPanel
          title={t('auto.denied.title')}
          what={t('auto.denied.body')}
          tryThis={t('auto.denied.try')}
          onRetry={s.begin}
        />
      ) : s.phase === 'nomic' || s.phase === 'error' ? (
        <ErrorPanel
          title={t('auto.denied.title')}
          what={t('auto.noMic')}
          tryThis={t('auto.denied.try')}
          onRetry={s.begin}
        />
      ) : s.phase === 'unavailable' ? (
        <p role="status" className="font-semibold">
          {t('auto.unavailable')}
        </p>
      ) : null}

      {s.phase === 'on' ? (
        <>
          <div>
            <div className="mb-1 text-base">{t('auto.room', { word })}</div>
            <div
              role="meter"
              aria-label={t('auto.meterLabel')}
              aria-valuemin={METER_MIN}
              aria-valuemax={METER_MAX}
              aria-valuenow={Math.round(room ?? METER_MIN)}
              aria-valuetext={word}
              data-testid="room-meter"
              className="h-[var(--t-space-2)] w-full overflow-hidden rounded-pill bg-surface-sunken"
            >
              <div
                className="h-full rounded-pill bg-primary transition-[width] duration-[var(--t-motion-duration-base)] ease-standard"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <StatusLine className="text-xl font-semibold" data-testid="boost-readout">
            {s.reading.paused
              ? t('auto.paused')
              : s.graphActive
                ? t('auto.adding', { n: s.reading.boostDb.toFixed(1) })
                : t('auto.waiting')}
          </StatusLine>
          {s.reading.paused ? (
            <div>
              <Button onClick={s.resume}>{t('auto.resume')}</Button>
            </div>
          ) : null}
        </>
      ) : null}

      <div>
        <p className="font-semibold" id="ab-sens">
          {t('auto.sensitivity')}
        </p>
        <Segmented<AutoBoostSensitivity>
          legend={t('auto.sensitivity')}
          value={s.sensitivity}
          onChange={s.setSensitivity}
          options={(['low', 'medium', 'high'] as const).map((v) => ({
            value: v,
            label: t(`auto.sensitivity.${v}` as MessageId),
          }))}
        />
        <p className="mt-1 text-sm text-text-muted">{t('auto.sensitivity.hint')}</p>
      </div>
      <p className="text-text-muted">{t('auto.honest')}</p>

      <Dialog
        open={s.headphonesDialog}
        onOpenChange={(o) => {
          if (!o) s.answerHeadphones(false);
        }}
        title={t('auto.headphones.title')}
        description={t('auto.headphones.body')}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              s.answerHeadphones(true);
            }}
          >
            {t('auto.headphones.yes')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              s.answerHeadphones(false);
            }}
          >
            {t('auto.headphones.no')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
