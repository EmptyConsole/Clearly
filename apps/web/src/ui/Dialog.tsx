import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

export interface DialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}

/** A focus-trapped modal (Radix). Escape and the overlay close it unless the caller blocks it. */
export function Dialog({ open, onOpenChange, title, description, children }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[var(--t-z-overlay)] bg-text/50" />
        <RadixDialog.Content className="fixed left-1/2 top-1/2 z-[var(--t-z-dialog)] max-h-[90dvh] w-[min(calc(100vw-var(--t-space-4)),var(--t-measure-text))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-surface border-hairline border-border bg-surface-raised p-4 shadow-overlay">
          <RadixDialog.Title className="text-2xl font-bold">{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="mt-2">{description}</RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
          <div className="mt-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
