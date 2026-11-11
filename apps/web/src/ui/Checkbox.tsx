import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { useId, type ReactNode } from 'react';
import { cx, focusRing } from './cx.ts';

export interface CheckboxProps {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly children: ReactNode;
  readonly required?: boolean;
  readonly describedBy?: string | undefined;
  readonly id?: string;
}

export function Checkbox({
  checked,
  onCheckedChange,
  children,
  required,
  describedBy,
  id,
}: CheckboxProps) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <div className="flex items-start gap-2">
      <RadixCheckbox.Root
        id={cid}
        checked={checked}
        required={required}
        aria-describedby={describedBy}
        onCheckedChange={(v) => {
          onCheckedChange(v === true);
        }}
        className={cx(
          'mt-0.5 flex size-[var(--t-space-4)] shrink-0 items-center justify-center rounded-control border-control border-border-control bg-surface-raised data-[state=checked]:border-primary data-[state=checked]:bg-primary',
          focusRing,
        )}
      >
        <RadixCheckbox.Indicator className="text-text-on-primary">
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <label htmlFor={cid} className="cursor-pointer text-base leading-body">
        {children}
      </label>
    </div>
  );
}
