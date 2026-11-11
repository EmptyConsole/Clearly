// Build-time variables, declared so they can be read as import.meta.env.NAME: Vite replaces only
// that dot form at build time, which lets the production build drop test-only code.
interface ImportMetaEnv {
  /** "1" in the Playwright dev server: turns on the test hooks (src/test/). */
  readonly VITE_TEST_HOOKS?: string;
  /** The public address of the web app, for the phone page's QR code (M14). */
  readonly VITE_PUBLIC_URL?: string;
  /** Where the desktop installers are published (M14); the desktop card links to it when set. */
  readonly VITE_DESKTOP_DOWNLOAD_URL?: string;
}
