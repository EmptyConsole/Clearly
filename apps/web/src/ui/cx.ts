/** Joins class names, skipping falsy values. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** The shared focus ring (3 px, token colour), for elements that are not native controls. */
export const focusRing =
  'focus-visible:outline-[length:var(--t-focus-width)] focus-visible:outline-solid focus-visible:outline-focus focus-visible:outline-offset-[var(--t-focus-offset)]';
