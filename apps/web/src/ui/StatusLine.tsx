import { cx } from './cx.ts';

/** A polite live region for status changes. Keep the element mounted; change only its text. */
export function StatusLine({
  children,
  className,
  'data-testid': testId,
}: {
  children: string;
  className?: string;
  'data-testid'?: string;
}) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={cx('min-h-[1.6em] text-base', className)}
      data-testid={testId}
    >
      {children}
    </p>
  );
}
