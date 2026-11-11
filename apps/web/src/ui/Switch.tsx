import * as RadixSwitch from '@radix-ui/react-switch';
import { useId } from 'react';
import { cx, focusRing } from './cx.ts';

export interface SwitchProps {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly label: string;
  readonly hint?: string;
  /** The switch is the card's title (larger label, hint in body size). */
  readonly title?: boolean;
}

/** A labelled on/off switch. The state is also shown in words, not by position alone. */
export function Switch({ checked, onCheckedChange, label, hint, title }: SwitchProps) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <label htmlFor={id} className={cx('cursor-pointer font-semibold', title && 'text-xl')}>
          {label}
        </label>
        {hint ? (
          <p id={hintId} className={cx('text-text-muted', title ? 'mt-1' : 'text-sm')}>
            {hint}
          </p>
        ) : null}
      </div>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-describedby={hint ? hintId : undefined}
        className={cx(
          'relative inline-flex h-[var(--t-target-min)] w-[calc(var(--t-target-min)*1.75)] shrink-0 items-center rounded-pill border-control border-border-control bg-surface-sunken p-0.5 data-[state=checked]:border-primary data-[state=checked]:bg-primary',
          focusRing,
        )}
      >
        <RadixSwitch.Thumb className="block size-[calc(var(--t-target-min)-var(--t-space-2))] rounded-pill bg-surface-raised shadow-raised transition-transform duration-[var(--t-motion-duration-fast)] ease-standard data-[state=checked]:translate-x-[calc(var(--t-target-min)*0.75)]" />
      </RadixSwitch.Root>
    </div>
  );
}
