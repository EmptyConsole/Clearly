import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from './cx.ts';

/**
 * The large circular test button: at least the test-button token (160 px), larger on phones.
 * Responses use pointerdown for low latency (see the Hearing Check stage).
 */
export const BigButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function BigButton({ className, type = 'button', ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cx(
          'flex aspect-square w-[calc(var(--t-target-test-button)*1.4)] max-w-full touch-manipulation select-none items-center justify-center whitespace-nowrap rounded-pill border-emphasis border-primary bg-primary p-3 text-center text-2xl font-bold leading-tight text-text-on-primary shadow-raised transition-transform duration-[var(--t-motion-duration-fast)] ease-standard active:scale-[0.97] hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 desktop:w-[calc(var(--t-target-test-button)*1.25)]',
          className,
        )}
        {...rest}
      />
    );
  },
);
