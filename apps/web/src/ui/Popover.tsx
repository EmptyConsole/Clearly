import * as RadixPopover from '@radix-ui/react-popover';
import type { ReactNode } from 'react';
import { t } from '../copy/en.ts';
import { buttonClass } from './buttonClass.ts';

export interface PopoverProps {
  /** The trigger button's text. */
  readonly label: string;
  readonly children: ReactNode;
}

/** A small non-modal explanation next to its trigger (Radix Popover). Escape closes it. */
export function Popover({ label, children }: PopoverProps) {
  return (
    <RadixPopover.Root>
      <RadixPopover.Trigger className={buttonClass('quiet')}>{label}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          className="z-[var(--t-z-dialog)] w-[min(calc(100vw-var(--t-space-4)),var(--t-measure-text))] rounded-surface border-hairline border-border bg-surface-raised p-3 shadow-overlay"
        >
          <div>{children}</div>
          <RadixPopover.Close className={buttonClass('secondary', 'mt-2')}>
            {t('quiet.close')}
          </RadixPopover.Close>
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
