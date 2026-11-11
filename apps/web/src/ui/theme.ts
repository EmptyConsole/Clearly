// Appearance (M10): match the device, light, dark, or high contrast. Kept in localStorage (not
// IndexedDB) so it applies before the first paint. The CSS in design/generated/tokens.css follows
// prefers-color-scheme and prefers-contrast unless data-theme pins a theme.

export const THEMES = ['system', 'light', 'dark', 'contrast'] as const;
export type Theme = (typeof THEMES)[number];
const KEY = 'clearly-theme';

export function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return (THEMES as readonly string[]).includes(v ?? '') ? (v as Theme) : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function saveTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}
