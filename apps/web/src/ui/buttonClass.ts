import { cx } from './cx.ts';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

const base =
  'inline-flex min-h-[var(--t-target-min)] items-center justify-center gap-1 rounded-control py-1 text-base font-semibold leading-ui no-underline transition-colors duration-[var(--t-motion-duration-fast)] ease-standard disabled:cursor-not-allowed disabled:opacity-60';

const variants: Record<ButtonVariant, string> = {
  primary:
    'px-3 bg-primary text-text-on-primary hover:bg-primary-hover hover:text-text-on-primary border-control border-primary',
  secondary:
    'px-3 bg-surface-raised text-text border-control border-border-control hover:border-primary hover:text-text',
  quiet: 'bg-transparent text-primary underline underline-offset-4 hover:text-primary-hover px-0',
};

/** Utility groups where a caller's class replaces the default (Tailwind cannot order them). */
const GROUPS: readonly RegExp[] = [/^text-(xs|sm|base|lg|xl|\d?xl)$/, /^px-/, /^py-/, /^min-h-/];

/** Drops default classes that a caller's extra classes override (size, padding, height). */
function merge(defaults: string, extra: string | undefined): string {
  if (!extra) return defaults;
  const mine = extra.split(/\s+/).filter(Boolean);
  const kept = defaults
    .split(/\s+/)
    .filter((c) => !GROUPS.some((g) => g.test(c) && mine.some((m) => g.test(m))));
  return cx(kept.join(' '), extra);
}

export function buttonClass(variant: ButtonVariant = 'primary', extra?: string): string {
  return merge(cx(base, variants[variant]), extra);
}
