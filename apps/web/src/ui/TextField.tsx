import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cx, focusRing } from './cx.ts';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | null;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, className, ...rest },
  ref,
) {
  const id = useId();
  const hintId = useId();
  const errId = useId();
  const described = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ');
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
        ref={ref}
        id={id}
        aria-describedby={described || undefined}
        aria-invalid={error ? true : undefined}
        className={cx(
          'min-h-[var(--t-target-input-height)] w-full w-full max-w-measure rounded-control border-control border-border-control bg-surface-raised px-2 text-base text-text placeholder:text-text-muted',
          error && 'border-danger',
          focusRing,
        )}
        {...rest}
      />
      {error ? (
        <p id={errId} className="font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});
