import { LOUDEST_LIMIT_MAX_DBFS, LOUDEST_LIMIT_MIN_DBFS } from '@clearly/core';
import type { GraphSettings } from '@clearly/audio';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t, type MessageId } from '../copy/en.ts';
import { kv } from '../storage/repos.ts';
import { useAppSettings } from '../store/appSettingsStore.ts';
import { Card } from '../ui/Card.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { Slider } from '../ui/Slider.tsx';
import { StatusLine } from '../ui/StatusLine.tsx';
import { Switch } from '../ui/Switch.tsx';

type Level = 'low' | 'medium' | 'high';

export function NightCard({
  settings,
  setNight,
  example,
}: {
  settings: GraphSettings;
  setNight: (level: Level | 'off') => void;
  example?: ReactNode;
}) {
  const app = useAppSettings();
  const on = settings.compressor.kind === 'night';
  const level: Level = settings.compressor.kind === 'night' ? settings.compressor.level : 'medium';
  const [schedule, setSchedule] = useState<{ enabled: boolean; time: string }>({
    enabled: false,
    time: '21:00',
  });
  const [status, setStatus] = useState('');
  const firedOn = useRef<string | null>(null);
  const setNightRef = useRef(setNight);
  useEffect(() => {
    setNightRef.current = setNight;
  }, [setNight]);
  const onRef = useRef(on);
  useEffect(() => {
    onRef.current = on;
  }, [on]);

  useEffect(() => {
    void kv.get('nightSchedule').then((s) => {
      if (s) setSchedule(s);
    });
  }, []);

  // The schedule runs only while Clearly is open (checked every 20 s).
  useEffect(() => {
    if (!schedule.enabled) return;
    const check = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const today = now.toDateString();
      if (hhmm >= schedule.time && firedOn.current !== today && !onRef.current) {
        firedOn.current = today;
        setNightRef.current('medium');
        setStatus(t('night.scheduled', { time: schedule.time }));
      }
    };
    check();
    const id = window.setInterval(check, 20_000);
    return () => {
      window.clearInterval(id);
    };
  }, [schedule]);

  const saveSchedule = (next: { enabled: boolean; time: string }) => {
    setSchedule(next);
    void kv.set('nightSchedule', next);
  };

  return (
    <Card>
      <Switch
        title
        checked={on}
        onCheckedChange={(v) => {
          setNight(v ? level : 'off');
        }}
        label={t('night.title')}
        hint={t('night.body')}
      />
      {on ? (
        <div className="mt-3">
          <Segmented<Level>
            legend={t('night.level.legend')}
            value={level}
            onChange={(v) => {
              setNight(v);
            }}
            options={(['low', 'medium', 'high'] as const).map((l) => ({
              value: l,
              label: t(`night.level.${l}` as MessageId),
            }))}
          />
        </div>
      ) : null}
      <Slider
        className="mt-3"
        label={t('advanced.loudest', { n: app.settings.loudestLimitDbfs })}
        valueText={t('advanced.loudest', { n: app.settings.loudestLimitDbfs })}
        hint={t('advanced.loudestHint')}
        value={app.settings.loudestLimitDbfs}
        min={LOUDEST_LIMIT_MIN_DBFS}
        max={LOUDEST_LIMIT_MAX_DBFS}
        step={1}
        onChange={(v) => void app.update({ loudestLimitDbfs: v })}
      />
      <div className="mt-3 flex flex-col gap-2">
        <Switch
          checked={schedule.enabled}
          onCheckedChange={(v) => {
            saveSchedule({ ...schedule, enabled: v });
          }}
          label={t('night.schedule')}
          hint={t('night.scheduleNote')}
        />
        {schedule.enabled ? (
          <label className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{t('night.scheduleTime')}</span>
            <input
              type="time"
              value={schedule.time}
              onChange={(e) => {
                if (/^\d{2}:\d{2}$/.test(e.target.value))
                  saveSchedule({ ...schedule, time: e.target.value });
              }}
              className="min-h-[var(--t-target-min)] rounded-control border-control border-border-control bg-surface-raised px-2"
            />
          </label>
        ) : null}
        <StatusLine>{status}</StatusLine>
      </div>
      {example}
    </Card>
  );
}
