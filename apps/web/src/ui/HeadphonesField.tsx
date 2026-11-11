import { useId } from 'react';
import { t } from '../copy/en.ts';
import { useProfileStore } from '../store/profileStore.ts';

/** M03: a simple text input for the headphone name, saved on the profile. M04 adds a selector. */
export function HeadphonesField() {
  const id = useId();
  const hintId = useId();
  const name = useProfileStore((s) => s.headphoneName);
  const setName = useProfileStore((s) => s.setHeadphoneName);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-semibold">
        {t('headphones.label')}
      </label>
      <p id={hintId} className="text-sm text-text-muted">
        {t('headphones.hint')}
      </p>
      <input
        id={id}
        type="text"
        autoComplete="off"
        maxLength={100}
        value={name}
        placeholder={t('headphones.default')}
        aria-describedby={hintId}
        onChange={(e) => {
          void setName(e.target.value);
        }}
        className="min-h-[var(--t-target-input-height)] w-full w-full max-w-measure rounded-control border-control border-border-control bg-surface-raised px-2 text-base text-text placeholder:text-text-muted focus-visible:outline-[length:var(--t-focus-width)] focus-visible:outline-solid focus-visible:outline-focus focus-visible:outline-offset-[var(--t-focus-offset)]"
      />
    </div>
  );
}
