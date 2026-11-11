import type { ReactNode } from 'react';
import { t } from '../copy/en.ts';
import { Button } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import type { HumFilterView, HumMode } from './useHumFilter.ts';

const fmtHz = (hz: number) =>
  Math.abs(hz - Math.round(hz)) < 0.05 ? String(Math.round(hz)) : hz.toFixed(1);

export function HumCard({
  mode,
  setMode,
  view,
  onDemo,
  demoPlaying,
  example,
}: {
  mode: HumMode;
  setMode: (m: HumMode) => void;
  view: HumFilterView;
  /** Plays the demo clip with hum added; null when that is the current source. */
  onDemo: (() => void) | null;
  demoPlaying: boolean;
  example?: ReactNode;
}) {
  const readout =
    mode === 'off'
      ? t('hum.offNote')
      : view.removingHz === null
        ? t('hum.listening')
        : view.harmonics > 0
          ? t('hum.readout', { hz: fmtHz(view.removingHz), n: view.harmonics })
          : t('hum.readoutOne', { hz: fmtHz(view.removingHz) });
  return (
    <Card>
      <h3 className="text-xl font-semibold">{t('hum.title')}</h3>
      <p className="mt-1 text-text-muted">{t('hum.body')}</p>
      <div className="mt-3">
        <Segmented<HumMode>
          legend={t('hum.mode.legend')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'off', label: t('hum.mode.off') },
            { value: 'auto', label: t('hum.mode.auto') },
            { value: '50', label: t('hum.mode.50') },
            { value: '60', label: t('hum.mode.60') },
          ]}
        />
      </div>
      <StatusLine className="mt-2 font-semibold" data-testid="hum-readout">
        {readout}
      </StatusLine>
      {onDemo && !demoPlaying ? (
        <div className="mt-2">
          <Button variant="secondary" onClick={onDemo}>
            {t('hum.demo')}
          </Button>
          <p className="mt-1 text-sm text-text-muted">{t('hum.demoNote')}</p>
        </div>
      ) : null}
      {example}
    </Card>
  );
}
