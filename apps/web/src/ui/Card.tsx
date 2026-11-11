import type { HTMLAttributes } from 'react';
import { cx } from './cx.ts';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'rounded-surface border-hairline border-border bg-surface-raised p-3 tablet:p-4',
        className,
      )}
      {...rest}
    />
  );
}
