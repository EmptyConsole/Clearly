import { VERY_LOUD_ALERT_MINUTES, localDay, type ExposureDay } from '@clearly/core';
import { useEffect, useId, useState } from 'react';
import { TableScroll } from '../ui/TableScroll.tsx';
import { t } from '../copy/en.ts';
import { exposureDays, kv } from '../storage/repos.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { Button } from '../ui/Button.tsx';
import { Card } from '../ui/Card.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { Switch } from '../ui/Switch.tsx';

const ZONES = [
  { key: 'comfortableMinutes', label: 'track.zone.comfortable', fill: 'var(--t-color-success)' },
  { key: 'loudMinutes', label: 'track.zone.loud', fill: 'var(--t-color-warning)' },
  { key: 'veryLoudMinutes', label: 'track.zone.veryLoud', fill: 'var(--t-color-danger)' },
] as const;
const ALERT_CHOICES = [5, 10, 15, 30, 60];

function lastSevenDays(now: Date): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i))),
  );
}

export function TrackerCard() {
  const lc = useProfileStore((s) => s.active?.calibration?.lcDbfs ?? null);
  const [days, setDays] = useState<Map<string, ExposureDay>>(new Map());
  const [paused, setPaused] = useState(false);
  const [alertMin, setAlertMin] = useState(VERY_LOUD_ALERT_MINUTES);
  const [status, setStatus] = useState('');
  const titleId = useId();
  const descId = useId();

  const load = async () => {
    const list = await exposureDays.list();
    setDays(new Map(list.map((d) => [d.id, d])));
    setPaused((await kv.get('trackerPaused')) ?? false);
    setAlertMin((await kv.get('veryLoudAlertMinutes')) ?? VERY_LOUD_ALERT_MINUTES);
  };
  useEffect(() => {
    void Promise.resolve().then(load);
    const id = window.setInterval(() => void load(), 5000);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  const week = lastSevenDays(new Date());
  const today = days.get(week[6] ?? '');
  const total = (d?: ExposureDay) =>
    d ? d.comfortableMinutes + d.loudMinutes + d.veryLoudMinutes : 0;
  const max = Math.max(1, ...week.map((k) => total(days.get(k))));
  const todayTotal = Math.max(1, total(today));
  const r = (n: number) => Math.round(n);

  return (
    <Card>
      <h2 className="text-2xl">{t('health.track.title')}</h2>
      <p className="mt-1 text-text-muted">{t('health.track.purpose')}</p>
      <p className="mt-2">{t('track.honest')}</p>
      {lc === null ? <p className="mt-2 font-semibold">{t('track.noCal')}</p> : null}

      <h3 className="mt-4 text-lg">{t('track.today')}</h3>
      <div
        role="img"
        aria-label={t('track.todayLabel', {
          comfortable: r(today?.comfortableMinutes ?? 0),
          loud: r(today?.loudMinutes ?? 0),
          veryLoud: r(today?.veryLoudMinutes ?? 0),
        })}
        className="mt-1 flex h-[var(--t-space-6)] w-full overflow-hidden rounded-control bg-surface-sunken"
        data-testid="today-bar"
      >
        {ZONES.map((z) => (
          <div
            key={z.key}
            style={{ width: `${((today?.[z.key] ?? 0) / todayTotal) * 100}%`, background: z.fill }}
          />
        ))}
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-4 text-sm">
        {ZONES.map((z) => (
          <li key={z.key} className="inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className="inline-block size-[var(--t-space-2)] rounded-control"
              style={{ background: z.fill }}
            />
            {t(z.label)}: {t('track.minutes', { n: r(today?.[z.key] ?? 0) })}
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-lg" id={titleId}>
        {t('track.week')}
      </h3>
      <svg
        viewBox="0 0 700 180"
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="mt-1 h-auto w-full"
      >
        <desc id={descId}>{t('track.weekDesc')}</desc>
        {week.map((k, i) => {
          const d = days.get(k);
          let y = 150;
          return (
            <g key={k}>
              {ZONES.map((z) => {
                const h = ((d?.[z.key] ?? 0) / max) * 130;
                y -= h;
                return (
                  <rect key={z.key} x={20 + i * 96} y={y} width={60} height={h} fill={z.fill} />
                );
              })}
              <text
                x={50 + i * 96}
                y={172}
                textAnchor="middle"
                fontSize="16"
                fill="var(--t-color-text-muted)"
              >
                {k.slice(5)}
              </text>
            </g>
          );
        })}
        <line x1={10} x2={690} y1={150} y2={150} stroke="var(--t-color-border)" />
      </svg>
      <TableScroll>
        <table className="w-full text-left text-base leading-ui">
          <caption className="text-left text-sm text-text-muted">{t('track.weekDesc')}</caption>
          <thead>
            <tr className="border-b border-border-control">
              <th scope="col" className="py-1 pr-3">
                {t('track.colDay')}
              </th>
              {ZONES.map((z) => (
                <th key={z.key} scope="col" className="py-1 pr-3">
                  {t(z.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {week.map((k) => (
              <tr key={k} className="border-b border-border">
                <th scope="row" className="py-1 pr-3 font-medium">
                  {k}
                </th>
                {ZONES.map((z) => (
                  <td key={z.key} className="py-1 pr-3">
                    {r(days.get(k)?.[z.key] ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">{t('track.alert', { n: alertMin })}</span>
          <select
            value={alertMin}
            onChange={(e) => {
              const v = Number(e.target.value);
              setAlertMin(v);
              void kv.set('veryLoudAlertMinutes', v);
            }}
            className="min-h-[var(--t-target-input-height)] w-full max-w-measure rounded-control border-control border-border-control bg-surface-raised px-2"
          >
            {ALERT_CHOICES.map((n) => (
              <option key={n} value={n}>
                {t('track.minutes', { n })}
              </option>
            ))}
          </select>
        </label>
        <Switch
          checked={paused}
          onCheckedChange={(v) => {
            setPaused(v);
            void kv.set('trackerPaused', v);
          }}
          label={t('track.pause')}
        />
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              void exposureDays.clear().then(() => {
                setDays(new Map());
                setStatus(t('track.cleared'));
              });
            }}
          >
            {t('track.clear')}
          </Button>
        </div>
        <StatusLine>{status}</StatusLine>
      </div>
    </Card>
  );
}
