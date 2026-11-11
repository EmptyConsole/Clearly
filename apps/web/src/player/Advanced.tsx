import type { ProcessingGraph } from '@clearly/audio';
import {
  BAND_FREQUENCIES_HZ,
  BOOST_STYLES,
  CAP_MAX_DB,
  CAP_MIN_DB,
  LOUDEST_LIMIT_MAX_DBFS,
  LOUDEST_LIMIT_MIN_DBFS,
  type BoostStyle,
} from '@clearly/core';
import { useEffect, useState } from 'react';
import { t, type MessageId } from '../copy/en.ts';
import { usePlatform } from '../platform/context.ts';
import { kv } from '../storage/repos.ts';
import { useAppSettings } from '../store/appSettingsStore.ts';
import { isDemoId } from '../store/demoProfiles.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { Button } from '../ui/Button.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { Slider } from '../ui/Slider.tsx';
import { setOutputDevice } from './session.ts';

const zeros = () => BAND_FREQUENCIES_HZ.map(() => 0);

export function Advanced({ graph, ctx }: { graph: ProcessingGraph; ctx: AudioContext }) {
  const platform = usePlatform();
  const active = useProfileStore((s) => s.active);
  const updateOverrides = useProfileStore((s) => s.updateOverrides);
  const updateSound = useProfileStore((s) => s.updateSound);
  const app = useAppSettings();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [deviceNote, setDeviceNote] = useState('');
  const [perf, setPerf] = useState('');
  const adjust = active?.settingsOverrides.bandAdjustDb ?? { left: zeros(), right: zeros() };

  useEffect(() => {
    if (!platform.capabilities.outputDeviceSelection) return;
    void navigator.mediaDevices
      .enumerateDevices()
      .then((d) => {
        setDevices(d.filter((x) => x.kind === 'audiooutput'));
      })
      .catch(() => undefined);
    void kv.get('outputDeviceId').then((id) => {
      if (id) setDeviceId(id);
    });
  }, [platform]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const id = window.setInterval(() => {
      void graph.getPerf().then((rs) => {
        setPerf(rs.map((r) => `${r.node}: ${JSON.stringify(r.report)}`).join('\n'));
      });
    }, 2000);
    return () => {
      window.clearInterval(id);
    };
  }, [graph]);

  const setBand = (ear: 'left' | 'right', i: number, v: number) => {
    const next = { left: [...adjust.left], right: [...adjust.right] };
    next[ear][i] = v;
    void updateOverrides({ bandAdjustDb: next });
  };

  const starter = active?.audiogram.method === 'starter';
  return (
    <div className="flex flex-col gap-6">
      {active ? (
        <section>
          <h3 className="text-xl">{t('advanced.bands')}</h3>
          <p className="text-text-muted">{t('advanced.bandsHint')}</p>
          <div className="mt-3 grid gap-x-6 gap-y-2 tablet:grid-cols-2">
            {(['right', 'left'] as const).map((ear) => (
              <div key={ear} className="flex flex-col gap-2">
                {BAND_FREQUENCIES_HZ.map((hz, i) => {
                  const v = adjust[ear][i] ?? 0;
                  const label = t('advanced.band', {
                    ear: t(ear === 'right' ? 'audiogram.right' : 'audiogram.left'),
                    hz,
                    n: v > 0 ? `+${v}` : v,
                  });
                  return (
                    <Slider
                      key={hz}
                      label={label}
                      valueText={label}
                      value={v}
                      min={-12}
                      max={12}
                      step={1}
                      onChange={(x) => {
                        setBand(ear, i, x);
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <Button
            variant="quiet"
            className="mt-2"
            onClick={() =>
              void updateOverrides({ bandAdjustDb: { left: zeros(), right: zeros() } })
            }
          >
            {t('advanced.reset')}
          </Button>
        </section>
      ) : null}
      {active && !isDemoId(active.id) && !starter ? (
        <section className="flex flex-col gap-3">
          <Segmented<BoostStyle>
            legend={t('settings.sound.style')}
            value={active.boostStyle}
            onChange={(v) => void updateSound(active.id, { boostStyle: v })}
            options={BOOST_STYLES.map((b) => ({
              value: b,
              label: t(`settings.sound.style.${b}` as MessageId),
            }))}
          />
          <Slider
            label={t('settings.sound.cap', { n: active.capDb })}
            valueText={t('settings.sound.cap', { n: active.capDb })}
            value={active.capDb}
            min={CAP_MIN_DB}
            max={CAP_MAX_DB}
            step={1}
            onChange={(v) => void updateSound(active.id, { capDb: v })}
          />
        </section>
      ) : null}
      <Slider
        label={t('advanced.loudest', { n: app.settings.loudestLimitDbfs })}
        valueText={t('advanced.loudest', { n: app.settings.loudestLimitDbfs })}
        hint={t('advanced.loudestHint')}
        value={app.settings.loudestLimitDbfs}
        min={LOUDEST_LIMIT_MIN_DBFS}
        max={LOUDEST_LIMIT_MAX_DBFS}
        step={1}
        onChange={(v) => void app.update({ loudestLimitDbfs: v })}
      />
      {platform.capabilities.outputDeviceSelection ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="output-device" className="font-semibold">
            {t('advanced.output')}
          </label>
          <select
            id="output-device"
            value={deviceId}
            onChange={(e) => {
              const id = e.target.value;
              setDeviceId(id);
              void setOutputDevice(ctx, id).then((ok) => {
                setDeviceNote(ok ? '' : t('advanced.outputFailed'));
                if (ok) void kv.set('outputDeviceId', id);
              });
            }}
            className="min-h-[var(--t-target-input-height)] w-full max-w-measure rounded-control border-control border-border-control bg-surface-raised px-2"
          >
            <option value="">{t('advanced.outputDefault')}</option>
            {devices
              .filter((d) => d.deviceId && d.deviceId !== 'default')
              .map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `${t('advanced.output')} ${i + 1}`}
                </option>
              ))}
          </select>
          {deviceNote ? <p role="status">{deviceNote}</p> : null}
        </div>
      ) : null}
      {import.meta.env.DEV ? (
        <section>
          <h3 className="text-lg">{t('advanced.perf')}</h3>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-sm">{perf}</pre>
        </section>
      ) : null}
    </div>
  );
}
