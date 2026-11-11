import { useEffect, useId } from 'react';
import { t } from '../copy/en.ts';
import { kv } from '../storage/repos.ts';
import { DEMO_PROFILES, isDemoId } from '../store/demoProfiles.ts';
import { useProfileStore } from '../store/profileStore.ts';
import { demoName } from '../settings/demoName.ts';
import { cx, focusRing } from './cx.ts';

/**
 * Headphones selector (M04): picks the profile for the headphones being worn. When the browser
 * already exposes output-device labels (it does only after a microphone permission was granted
 * for other reasons), the profile last used with that device is selected automatically. Clearly
 * never asks for a permission just to read labels.
 */
export function ProfileSelector() {
  const id = useId();
  const hintId = useId();
  const { profiles, active, demoMode, select } = useProfileStore();
  const options = [...profiles, ...(demoMode ? DEMO_PROFILES : [])];

  useEffect(() => {
    const state = { live: true };
    void (async () => {
      const label = await currentOutputLabel();
      if (!label || !state.live) return;
      const map = (await kv.get('deviceProfiles')) ?? {};
      const wanted = map[label];
      if (wanted && wanted !== useProfileStore.getState().active?.id) await select(wanted);
    })();
    return () => {
      state.live = false;
    };
  }, [select]);

  if (options.length < 2) return null;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {t('selector.label')}
      </label>
      <p id={hintId} className="text-sm text-text-muted">
        {t('selector.hint')}
      </p>
      <select
        id={id}
        aria-describedby={hintId}
        value={active?.id ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          void select(v).then(async () => {
            const label = await currentOutputLabel();
            if (!label || isDemoId(v)) return;
            const map = (await kv.get('deviceProfiles')) ?? {};
            await kv.set('deviceProfiles', { ...map, [label]: v });
          });
        }}
        className={cx(
          'min-h-[var(--t-target-input-height)] w-full w-full max-w-measure rounded-control border-control border-border-control bg-surface-raised px-2 text-base text-text',
          focusRing,
        )}
      >
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {isDemoId(p.id)
              ? t('selector.demoOption', { name: demoName(p) })
              : t('selector.option', { name: p.name, headphones: p.headphoneName })}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The default output device's label, or null when labels are hidden or unsupported. */
async function currentOutputLabel(): Promise<string | null> {
  const md = navigator.mediaDevices as MediaDevices | undefined;
  if (!md || typeof md.enumerateDevices !== 'function') return null;
  try {
    const devices = await md.enumerateDevices();
    const out =
      devices.find((d) => d.kind === 'audiooutput' && d.deviceId === 'default') ??
      devices.find((d) => d.kind === 'audiooutput');
    return out?.label ? out.label.slice(0, 200) : null;
  } catch {
    return null;
  }
}
