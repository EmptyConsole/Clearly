import type { HearingCheckRecord, SinCheck } from '@clearly/core';
import { useEffect, useState } from 'react';
import { t, type MessageId } from '../copy/en.ts';
import { methodLabel } from '../check/methodLabel.ts';
import { formatDate } from '../settings/format.ts';
import { hearingChecks, kv, sinChecks } from '../storage/repos.ts';
import { Audiogram } from '../ui/Audiogram.tsx';
import { seriesFromAudiogram } from '../ui/audiogramData.ts';
import { Card } from '../ui/Card.tsx';
import { Checkbox } from '../ui/Checkbox.tsx';
import { Switch } from '../ui/Switch.tsx';

export function HistoryCard() {
  const [checks, setChecks] = useState<HearingCheckRecord[]>([]);
  const [sins, setSins] = useState<SinCheck[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [months, setMonths] = useState(6);
  const [notify, setNotify] = useState(false);
  const [notifyNote, setNotifyNote] = useState('');

  useEffect(() => {
    void Promise.all([
      hearingChecks.list(),
      sinChecks.list(),
      kv.get('reminderMonths'),
      kv.get('reminderNotify'),
    ]).then(([c, s, m, n]) => {
      setChecks([...c].reverse());
      setSins([...s].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      if (m !== undefined) setMonths(m);
      setNotify(n ?? false);
    });
  }, []);

  const toggle = (id: string, on: boolean) => {
    setPicked((p) =>
      on ? [...p.filter((x) => x !== id), id].slice(-2) : p.filter((x) => x !== id),
    );
  };
  const chosen = checks
    .filter((c) => picked.includes(c.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const [earlier, later] = chosen;
  const items = [
    ...checks.map((c) => ({ kind: 'check' as const, at: c.createdAt, c })),
    ...sins.map((s) => ({ kind: 'sin' as const, at: s.createdAt, s })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Card>
      <h2 className="text-2xl">{t('health.hist.title')}</h2>
      <p className="mt-1 text-text-muted">{t('health.hist.purpose')}</p>
      {items.length === 0 ? (
        <p className="mt-3">{t('health.hist.none')}</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-text-muted">{t('hist.compareHint')}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {items.map((it) =>
              it.kind === 'check' ? (
                <li key={it.c.id}>
                  <Checkbox
                    checked={picked.includes(it.c.id)}
                    onCheckedChange={(v) => {
                      toggle(it.c.id, v);
                    }}
                  >
                    {t('hist.item', {
                      method: methodLabel(it.c.audiogram.method),
                      date: formatDate(it.c.createdAt),
                      headphones: it.c.headphoneName,
                    })}
                    {it.c.audiogram.reliability
                      ? `. ${t('hist.reliability', { level: t(`results.reliability.${it.c.audiogram.reliability}` as MessageId) })}`
                      : ''}
                  </Checkbox>
                </li>
              ) : (
                <li key={it.s.id} className="pl-[calc(var(--t-space-4)+var(--t-space-2))]">
                  {t('hist.sinItem', {
                    date: formatDate(it.s.createdAt),
                    result: t(`sin.category.${it.s.category}` as MessageId),
                  })}
                </li>
              ),
            )}
          </ul>
        </>
      )}
      {earlier && later ? (
        <section className="mt-4" aria-label={t('hist.compareTitle')}>
          <h3 className="text-xl">{t('hist.compareTitle')}</h3>
          <Audiogram
            title={t('hist.compareTitle')}
            series={seriesFromAudiogram(later.audiogram)}
            overlay={{
              series: seriesFromAudiogram(earlier.audiogram),
              label: t('hist.earlier', { date: formatDate(earlier.createdAt) }),
              seriesLabel: t('hist.legend', {
                later: t('hist.later', { date: formatDate(later.createdAt) }),
                earlier: t('hist.earlier', { date: formatDate(earlier.createdAt) }),
              }),
            }}
          />
          <p className="mt-2 font-semibold">{t('hist.compareNote')}</p>
          {earlier.headphoneName !== later.headphoneName ? (
            <p className="mt-1">
              {t('hist.differentHeadphones', { a: earlier.headphoneName, b: later.headphoneName })}
            </p>
          ) : null}
        </section>
      ) : null}
      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">{t('reminder.check.setting')}</span>
          <select
            value={months}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMonths(v);
              void kv.set('reminderMonths', v);
            }}
            className="min-h-[var(--t-target-input-height)] w-full max-w-measure rounded-control border-control border-border-control bg-surface-raised px-2"
          >
            <option value={0}>{t('reminder.check.off')}</option>
            {[3, 6, 12].map((m) => (
              <option key={m} value={m}>
                {t('reminder.check.months', { n: m })}
              </option>
            ))}
          </select>
        </label>
        {'Notification' in window ? (
          <Switch
            checked={notify}
            onCheckedChange={(v) => {
              if (!v) {
                setNotify(false);
                void kv.set('reminderNotify', false);
                return;
              }
              // Permission is asked only now, when the person turns the option on.
              void Notification.requestPermission().then((p) => {
                const ok = p === 'granted';
                setNotify(ok);
                setNotifyNote(ok ? '' : t('reminder.check.notifyDenied'));
                void kv.set('reminderNotify', ok);
              });
            }}
            label={t('reminder.check.notify')}
            hint={t('reminder.check.notifyHint')}
          />
        ) : null}
        {notifyNote ? <p role="status">{notifyNote}</p> : null}
      </div>
    </Card>
  );
}
