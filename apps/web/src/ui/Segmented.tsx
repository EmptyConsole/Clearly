import { useId } from 'react';
import { cx } from './cx.ts';

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

/** A large two-or-more option control, built on native radios so it is keyboard-complete. */
export function Segmented<T extends string>({
  legend,
  options,
  value,
  onChange,
  large,
}: {
  legend: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  large?: boolean;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div
        className={cx(
          'max-w-full rounded-surface border-control border-border-control bg-surface-sunken p-0.5',
          large ? 'grid w-full auto-cols-fr grid-flow-col' : 'inline-flex flex-wrap',
        )}
      >
        {options.map((o) => (
          <label
            key={o.value}
            className={cx(
              'inline-flex cursor-pointer items-center justify-center rounded-pill px-2 text-center font-bold [overflow-wrap:anywhere] tablet:px-4 has-[:checked]:bg-primary has-[:checked]:text-text-on-primary',
              'has-[:focus-visible]:outline-[length:var(--t-focus-width)] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-offset-[var(--t-focus-offset)]',
              large
                ? 'min-h-[calc(var(--t-target-min)*1.4)] text-xl'
                : 'min-h-[var(--t-target-min)] text-base',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => {
                onChange(o.value);
              }}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
