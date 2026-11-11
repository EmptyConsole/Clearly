import { BAND_FREQUENCIES_HZ } from '@clearly/core';
import type { ProcessingGraph } from '@clearly/audio';
import { useEffect, useId, useState } from 'react';
import { TableScroll } from '../ui/TableScroll.tsx';
import { t } from '../copy/en.ts';
import { CHART_FREQS, eqCurves } from './eqResponse.ts';

const W = 640;
const H = 260;
const PAD = { l: 56, r: 16, t: 16, b: 40 };
const x = (hz: number) => PAD.l + (Math.log(hz / 100) / Math.log(120)) * (W - PAD.l - PAD.r);

/** "See what Clearly is doing": EQ curve with spectrum and Auto Boost overlays, and meters. */
export function Insight({ graph }: { graph: ProcessingGraph }) {
  const titleId = useId();
  const descId = useId();
  const [spectrum, setSpectrum] = useState<number[] | null>(null);
  const [lufs, setLufs] = useState<number | null>(null);
  const [red, setRed] = useState(graph.taps.compressionReduction());
  const curves = eqCurves(graph.plan);
  const lo = Math.min(-12, Math.floor(Math.min(...curves.left, ...curves.right) / 6) * 6);
  const hi = Math.max(24, Math.ceil(Math.max(...curves.left, ...curves.right) / 6) * 6);
  const y = (db: number) => PAD.t + ((hi - db) / (hi - lo)) * (H - PAD.t - PAD.b);

  useEffect(() => {
    const a = graph.taps.analyser;
    const data = new Float32Array(a.frequencyBinCount);
    const off = graph.taps.loudness.subscribe((r) => {
      setLufs(r.momentaryLufs);
    });
    const id = window.setInterval(() => {
      a.getFloatFrequencyData(data);
      setSpectrum(
        CHART_FREQS.map((f) => {
          const i = Math.min(
            data.length - 1,
            Math.round((f / (a.context.sampleRate / 2)) * data.length),
          );
          return data[i] ?? -140;
        }),
      );
      setRed(graph.taps.compressionReduction());
    }, 150);
    return () => {
      off();
      window.clearInterval(id);
    };
  }, [graph]);

  const path = (vals: readonly number[]) =>
    vals
      .map(
        (v, i) => `${i === 0 ? 'M' : 'L'}${x(CHART_FREQS[i] ?? 100).toFixed(1)},${y(v).toFixed(1)}`,
      )
      .join(' ');
  // Spectrum drawn as a shaded shape scaled into the chart's lower half.
  const specPath = spectrum
    ? `M${x(100)},${H - PAD.b} ` +
      spectrum
        .map(
          (db, i) =>
            `L${x(CHART_FREQS[i] ?? 100).toFixed(1)},${(H - PAD.b - Math.max(0, Math.min(1, (db + 110) / 80)) * (H - PAD.t - PAD.b) * 0.6).toFixed(1)}`,
        )
        .join(' ') +
      ` L${x(12000)},${H - PAD.b} Z`
    : '';
  const grid: number[] = [];
  for (let d = lo; d <= hi; d += 6) grid.push(d);
  const atBand = (vals: readonly number[], hz: number) => {
    let best = 0;
    for (let i = 0; i < CHART_FREQS.length; i++) {
      if (Math.abs((CHART_FREQS[i] ?? 0) - hz) < Math.abs((CHART_FREQS[best] ?? 0) - hz)) best = i;
    }
    return vals[best] ?? 0;
  };
  const limiterDb = Math.max(red.programLimiterDb, red.loudestLimiterDb);
  return (
    <div className="flex flex-col gap-4">
      <figure>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-labelledby={titleId}
          aria-describedby={descId}
          className="h-auto w-full"
        >
          <title id={titleId}>{t('insight.eq.title')}</title>
          <desc id={descId}>{t('insight.eq.desc')}</desc>
          {specPath ? (
            <path d={specPath} fill="var(--t-color-surface-sunken)" stroke="none" />
          ) : null}
          {grid.map((d) => (
            <g key={d}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y(d)}
                y2={y(d)}
                stroke="var(--t-color-border)"
                strokeWidth={d === 0 ? 2 : 1}
              />
              <text
                x={PAD.l - 8}
                y={y(d) + 5}
                textAnchor="end"
                fontSize="14"
                fill="var(--t-color-text-muted)"
              >
                {d}
              </text>
            </g>
          ))}
          {[125, 250, 500, 1000, 2000, 4000, 8000].map((hz) => (
            <text
              key={hz}
              x={x(hz)}
              y={H - PAD.b + 22}
              textAnchor="middle"
              fontSize="14"
              fill="var(--t-color-text-muted)"
            >
              {hz >= 1000 ? `${hz / 1000}k` : hz}
            </text>
          ))}
          <path
            d={path(curves.ambient)}
            fill="none"
            stroke="var(--t-color-text-muted)"
            strokeWidth={2}
            strokeDasharray="2 5"
            strokeLinecap="round"
          />
          <path
            d={path(curves.right)}
            fill="none"
            stroke="var(--t-color-ear-right)"
            strokeWidth={3}
          />
          <path
            d={path(curves.left)}
            fill="none"
            stroke="var(--t-color-ear-left)"
            strokeWidth={3}
            strokeDasharray="8 5"
          />
        </svg>
        <figcaption className="mt-1 flex flex-wrap gap-x-4 text-sm">
          <span>{t('insight.legend.right')}</span>
          <span>{t('insight.legend.left')}</span>
          <span>{t('insight.legend.ambient')}</span>
          <span>{t('insight.legend.spectrum')}</span>
        </figcaption>
      </figure>
      <TableScroll>
        <table className="w-full text-left text-base leading-ui">
          <caption className="mb-1 text-left text-sm text-text-muted">
            {t('insight.eq.tableCaption')}
          </caption>
          <thead>
            <tr className="border-b border-border-control">
              <th scope="col" className="py-1 pr-3">
                {t('audiogram.colPitch')}
              </th>
              <th scope="col" className="py-1 pr-3">
                {t('audiogram.right')}
              </th>
              <th scope="col" className="py-1 pr-3">
                {t('audiogram.left')}
              </th>
              <th scope="col" className="py-1">
                {t('insight.eq.colAmbient')}
              </th>
            </tr>
          </thead>
          <tbody>
            {BAND_FREQUENCIES_HZ.map((hz) => (
              <tr key={hz} className="border-b border-border">
                <th scope="row" className="py-1 pr-3 font-medium">
                  {hz}
                </th>
                <td className="py-1 pr-3">{atBand(curves.right, hz).toFixed(1)}</td>
                <td className="py-1 pr-3">{atBand(curves.left, hz).toFixed(1)}</td>
                <td className="py-1">{atBand(curves.ambient, hz).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <TableScroll>
        <table className="w-full max-w-measure text-left text-base leading-ui">
          <caption className="mb-1 text-left text-sm text-text-muted">
            {t('insight.metersCaption')}
          </caption>
          <tbody>
            <tr className="border-b border-border">
              <th scope="row" className="py-1 pr-3 font-medium">
                {t('insight.row.loudness')}
              </th>
              <td className="py-1" data-testid="meter-loudness">
                {lufs === null || lufs < -70
                  ? t('insight.loudnessQuiet')
                  : t('insight.loudness', { n: lufs.toFixed(0) })}
              </td>
            </tr>
            <tr className="border-b border-border">
              <th scope="row" className="py-1 pr-3 font-medium">
                {t('insight.row.compression')}
              </th>
              <td className="py-1">
                {t('insight.compression', { n: red.compressorDb.toFixed(1) })}
              </td>
            </tr>
            <tr className="border-b border-border">
              <th scope="row" className="py-1 pr-3 font-medium">
                {t('insight.row.limiter')}
              </th>
              <td className="py-1">{t('insight.limiter', { n: limiterDb.toFixed(1) })}</td>
            </tr>
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}
