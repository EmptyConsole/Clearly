// Build-time configuration (M12). esbuild replaces these with the values of CLEARLY_SERVER_URL and
// CLEARLY_DOWNLOAD_URL when the desktop app is built (scripts/build.ts). There is no auto-update in
// this version; About shows the version and the download page.

declare const __CLEARLY_SERVER_URL__: string;
declare const __CLEARLY_DOWNLOAD_URL__: string;

/** The optional Clearly server (backup, restore codes, sync, heavy downloads); null when unset. */
export const SERVER_URL: string | null =
  __CLEARLY_SERVER_URL__ === '' ? null : __CLEARLY_SERVER_URL__;

/** Where newer versions are offered. */
export const DOWNLOAD_URL: string =
  __CLEARLY_DOWNLOAD_URL__ !== ''
    ? __CLEARLY_DOWNLOAD_URL__
    : SERVER_URL
      ? `${SERVER_URL}/more/everywhere`
      : 'https://clearly.invalid/download';
