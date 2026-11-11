/** The app version shown in feedback and About (set VITE_APP_VERSION at build time). */
export const APP_VERSION: string =
  (import.meta.env['VITE_APP_VERSION'] as string | undefined) ?? '0.0.0';
