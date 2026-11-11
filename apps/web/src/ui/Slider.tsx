import { useId } from 'react';
import { cx } from './cx.ts';

export interface SliderProps {
  /** Visible label that includes the value in words, for example "Voice focus: Medium". */
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (v: number) => void;
  /** Spoken value, in words. */
  readonly valueText: string;
  readonly hint?: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

/** A native range input: keyboard-complete, with the value in words for screen readers. */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  valueText,
  hint,
  disabled,
  className,
}: SliderProps) {
  const id = useId();
  const hintId = useId();
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-text-muted">
          {hint}
        </p>
      ) : null}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={valueText}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => {
          onChange(Number(e.target.value));
        }}
        className="h-[var(--t-target-min)] w-full max-w-measure cursor-pointer accent-primary disabled:cursor-not-allowed"
      />
    </div>
  );
}
