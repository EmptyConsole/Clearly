import { useEffect, useState } from 'react';
import { t } from '../copy/en.ts';
import { cx, focusRing } from '../ui/cx.ts';

/**
 * The large number pad for the speech-in-noise check: 0 to 9, Delete last and Not sure, plus the
 * keyboard (digits and Backspace). Calls onSubmit with three answers (null for Not sure).
 */
export function NumberPad({
  enabled,
  onSubmit,
}: {
  enabled: boolean;
  onSubmit: (a: (number | null)[]) => void;
}) {
  const [entry, setEntry] = useState<(number | null)[]>([]);
  // A new triplet starts with an empty entry: reset whenever the pad is re-enabled.
  const [lastEnabled, setLastEnabled] = useState(enabled);
  if (enabled !== lastEnabled) {
    setLastEnabled(enabled);
    if (enabled) setEntry([]);
  }

  const press = (v: number | null) => {
    if (!enabled) return;
    const next = [...entry, v];
    if (next.length >= 3) {
      setEntry([]);
      onSubmit(next);
    } else setEntry(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!enabled) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        press(Number(e.key));
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setEntry((x) => x.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });

  return (
    <>
      <p className="text-2xl font-bold" aria-live="polite">
        {t('sin.entered', {
          digits: entry.map((d) => (d === null ? '?' : String(d))).join(' ') || '-',
        })}
      </p>
      <div role="group" aria-label={t('sin.pad')} className="grid max-w-measure grid-cols-3 gap-1">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <PadKey
            key={d}
            label={String(d)}
            disabled={!enabled}
            onPress={() => {
              press(d);
            }}
          />
        ))}
        <PadKey
          label={t('sin.backspace')}
          small
          disabled={!enabled}
          onPress={() => {
            setEntry((x) => x.slice(0, -1));
          }}
        />
        <PadKey
          label="0"
          disabled={!enabled}
          onPress={() => {
            press(0);
          }}
        />
        <PadKey
          label={t('sin.notSure')}
          small
          disabled={!enabled}
          onPress={() => {
            press(null);
          }}
        />
      </div>
      <p className="text-sm text-text-muted">{t('sin.keys')}</p>
    </>
  );
}

function PadKey({
  label,
  onPress,
  disabled,
  small,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      className={cx(
        'min-h-[calc(var(--t-target-min)*1.4)] rounded-control border-control border-border-control bg-surface-raised font-bold disabled:opacity-60',
        small ? 'text-base' : 'text-2xl',
        focusRing,
      )}
    >
      {label}
    </button>
  );
}
