import { useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { t } from '../copy/en.ts';
import type { AudiogramSeries } from './audiogramData.ts';
import { TableScroll } from './TableScroll.tsx';
import { Button } from './Button.tsx';

// Standard audiogram convention: log frequency across, dB increasing downwards, red circle for the
// right ear, blue X for the left. Ears are told apart by shape and by label, not colour alone.

const DEFAULT_W = 640;
const PAD = { left: 64, right: 24, top: 24, bottom: 56 };

/**
 * The drawing uses one SVG unit per CSS pixel of rendered width, so axis text stays at its real
 * size on a phone or in a narrow column instead of shrinking with the chart.
 */
function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(DEFAULT_W);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setW(Math.round(width));
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [ref]);
  return Math.max(300, w);
}
const FREQS = [250, 500, 1000, 2000, 3000, 4000, 6000, 8000] as const;
const TICK_LABEL: Record<number, string> = {
  250: '250',
  500: '500',
  1000: '1k',
  2000: '2k',
  3000: '3k',
  4000: '4k',
  6000: '6k',
  8000: '8k',
};

export interface AudiogramProps {
  readonly series: AudiogramSeries;
  readonly title?: string;
  /** Live charts show only finished points and have a shorter description. */
  readonly live?: boolean;
  /** A second (earlier) result drawn underneath in a muted colour, for comparison. */
  readonly overlay?: {
    readonly series: AudiogramSeries;
    readonly label: string;
    readonly seriesLabel: string;
  };
}

export function Audiogram({
  series,
  title = t('audiogram.title'),
  live = false,
  overlay,
}: AudiogramProps) {
  const [showTable, setShowTable] = useState(false);
  const figRef = useRef<HTMLElement>(null);
  const W = useWidth(figRef);
  const H = Math.round(Math.min(400, Math.max(260, W * 0.56)));
  const narrow = W < 480;
  const x = (hz: number) =>
    PAD.left + (Math.log2(hz / 250) / Math.log2(8000 / 250)) * (W - PAD.left - PAD.right);
  const titleId = useId();
  const descId = useId();
  const tableId = useId();
  const values = [
    ...series.left,
    ...series.right,
    ...(overlay ? [...overlay.series.left, ...overlay.series.right] : []),
  ]
    .map((p) => p.lossDb)
    .filter((v): v is number => v !== null);
  const maxDb = Math.max(80, Math.ceil((Math.max(0, ...values) + 10) / 10) * 10);
  const minDb = -10;
  const y = (db: number) => PAD.top + ((db - minDb) / (maxDb - minDb)) * (H - PAD.top - PAD.bottom);
  const gridDb: number[] = [];
  for (let d = minDb; d <= maxDb; d += 10) gridDb.push(d);
  const hasPoints = values.length > 0;

  const line = (pts: AudiogramSeries['left']) =>
    pts
      .filter((p) => p.lossDb !== null)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.hz).toFixed(1)},${y(p.lossDb ?? 0).toFixed(1)}`)
      .join(' ');

  return (
    <figure ref={figRef} className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="h-auto w-full max-w-full text-text"
      >
        <title id={titleId}>{title}</title>
        <desc id={descId}>{t('audiogram.desc')}</desc>
        <rect
          x={PAD.left}
          y={PAD.top}
          width={W - PAD.left - PAD.right}
          height={H - PAD.top - PAD.bottom}
          fill="var(--t-color-surface-sunken)"
        />
        {gridDb.map((d) => (
          <g key={d}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(d)}
              y2={y(d)}
              stroke="var(--t-color-border)"
              strokeWidth={d === 0 ? 2 : 1}
            />
            <text
              x={PAD.left - 8}
              y={y(d) + 5}
              textAnchor="end"
              fontSize="16"
              fill="var(--t-color-text-muted)"
            >
              {d}
            </text>
          </g>
        ))}
        {FREQS.map((hz) => (
          <g key={hz}>
            <line
              x1={x(hz)}
              x2={x(hz)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--t-color-border)"
              strokeWidth={1}
            />
            <text
              x={x(hz)}
              y={H - PAD.bottom + 20}
              textAnchor="middle"
              fontSize="16"
              fill="var(--t-color-text-muted)"
            >
              {narrow && (hz === 3000 || hz === 6000) ? '' : TICK_LABEL[hz]}
            </text>
          </g>
        ))}
        <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="16" fill="var(--t-color-text)">
          {t('audiogram.axisFreq')}
        </text>
        <text
          x={16}
          y={(PAD.top + H - PAD.bottom) / 2}
          textAnchor="middle"
          fontSize="16"
          fill="var(--t-color-text)"
          transform={`rotate(-90 16 ${(PAD.top + H - PAD.bottom) / 2})`}
        >
          {t('audiogram.axisLoss')}
        </text>
        <path
          d={line(series.right)}
          fill="none"
          stroke="var(--t-color-ear-right)"
          strokeWidth={2}
        />
        <path
          d={line(series.left)}
          fill="none"
          stroke="var(--t-color-ear-left)"
          strokeWidth={2}
          strokeDasharray="6 4"
        />
        {series.right.map((p) =>
          p.lossDb === null ? null : (
            <circle
              key={`r${p.hz}`}
              cx={x(p.hz)}
              cy={y(p.lossDb)}
              r={8}
              fill={p.estimated ? 'var(--t-color-surface-raised)' : 'none'}
              stroke="var(--t-color-ear-right)"
              strokeWidth={p.estimated ? 2 : 3}
              strokeDasharray={p.estimated ? '3 3' : undefined}
            />
          ),
        )}
        {overlay
          ? (['right', 'left'] as const).map((ear) => (
              <g key={`ov-${ear}`} opacity={0.75}>
                <path
                  d={line(overlay.series[ear])}
                  fill="none"
                  stroke="var(--t-color-text-muted)"
                  strokeWidth={2}
                  strokeDasharray={ear === 'left' ? '2 4' : undefined}
                />
                {overlay.series[ear].map((p) =>
                  p.lossDb === null ? null : ear === 'right' ? (
                    <circle
                      key={`ovr${p.hz}`}
                      cx={x(p.hz)}
                      cy={y(p.lossDb)}
                      r={6}
                      fill="none"
                      stroke="var(--t-color-text-muted)"
                      strokeWidth={2}
                    />
                  ) : (
                    <path
                      key={`ovl${p.hz}`}
                      d={`M${x(p.hz) - 5},${y(p.lossDb) - 5} L${x(p.hz) + 5},${y(p.lossDb) + 5} M${x(p.hz) + 5},${y(p.lossDb) - 5} L${x(p.hz) - 5},${y(p.lossDb) + 5}`}
                      stroke="var(--t-color-text-muted)"
                      strokeWidth={2}
                    />
                  ),
                )}
              </g>
            ))
          : null}
        {series.left.map((p) => {
          if (p.lossDb === null) return null;
          const cx = x(p.hz);
          const cy = y(p.lossDb);
          const s = 7;
          return (
            <path
              key={`l${p.hz}`}
              d={`M${cx - s},${cy - s} L${cx + s},${cy + s} M${cx + s},${cy - s} L${cx - s},${cy + s}`}
              stroke="var(--t-color-ear-left)"
              strokeWidth={p.estimated ? 2 : 3}
              strokeDasharray={p.estimated ? '3 3' : undefined}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <circle
              cx="10"
              cy="10"
              r="7"
              fill="none"
              stroke="var(--t-color-ear-right)"
              strokeWidth="3"
            />
          </svg>
          {t('audiogram.right')}
        </span>
        <span className="inline-flex items-center gap-1">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M4,4 L16,16 M16,4 L4,16"
              stroke="var(--t-color-ear-left)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          {t('audiogram.left')}
        </span>
        {overlay ? <span className="text-text-muted">{overlay.seriesLabel}</span> : null}
        {!live ? (
          <span className="inline-flex items-center gap-1 text-text-muted">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <circle
                cx="10"
                cy="10"
                r="7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray="3 3"
              />
            </svg>
            {t('hearingCheck.results.estimatedBand')}
          </span>
        ) : null}
      </figcaption>
      {live && !hasPoints ? (
        <p className="mt-1 text-sm text-text-muted">{t('audiogram.empty')}</p>
      ) : null}
      <Button
        variant="quiet"
        className="mt-1"
        aria-expanded={showTable}
        aria-controls={tableId}
        onClick={() => {
          setShowTable((s) => !s);
        }}
      >
        {showTable ? t('audiogram.hideTable') : t('audiogram.showTable')}
      </Button>
      <TableScroll id={tableId} hidden={!showTable} className="mt-2">
        <table className="w-full text-left text-base leading-ui">
          <caption className="mb-1 text-left text-sm text-text-muted">
            {t('audiogram.tableCaption')}
          </caption>
          <thead>
            <tr className="border-b border-border-control">
              <th scope="col" className="py-1 pr-3">
                {t('audiogram.colPitch')}
              </th>
              <th scope="col" className="py-1 pr-3">
                {t('audiogram.right')}
              </th>
              <th scope="col" className="py-1">
                {t('audiogram.left')}
              </th>
              {overlay ? (
                <>
                  <th scope="col" className="py-1 pl-3">
                    {`${t('audiogram.right')}, ${overlay.label}`}
                  </th>
                  <th scope="col" className="py-1 pl-3">
                    {`${t('audiogram.left')}, ${overlay.label}`}
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {FREQS.map((hz, i) => {
              const cell = (p: AudiogramSeries['left'][number] | undefined) => {
                if (!p || p.lossDb === null) return t('audiogram.notMeasured');
                const n = Math.round(p.lossDb);
                return p.estimated ? t('audiogram.estimated', { n }) : String(n);
              };
              return (
                <tr key={hz} className="border-b border-border">
                  <th scope="row" className="py-1 pr-3 font-medium">
                    {hz}
                  </th>
                  <td className="py-1 pr-3">{cell(series.right[i])}</td>
                  <td className="py-1">{cell(series.left[i])}</td>
                  {overlay ? (
                    <>
                      <td className="py-1 pl-3">{cell(overlay.series.right[i])}</td>
                      <td className="py-1 pl-3">{cell(overlay.series.left[i])}</td>
                    </>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </figure>
  );
}
