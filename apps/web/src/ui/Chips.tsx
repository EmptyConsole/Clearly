import { useId } from 'react';
import { cx } from './cx.ts';

/** Single-choice chips (native radios): wrap freely, each its own pill. */
export function Chips<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1 font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <label
            key={o.value}
            className={cx(
              'inline-flex min-h-[var(--t-target-min)] cursor-pointer items-center rounded-pill border-control border-border-control bg-surface-raised px-3 font-semibold has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-text-on-primary',
              'has-[:focus-visible]:outline-[length:var(--t-focus-width)] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-offset-[var(--t-focus-offset)]',
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
