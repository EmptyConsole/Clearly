// Desktop security rules (M12), kept free of Electron imports so they are unit-tested: the content
// security policy (the web CSP, with connect-src limited to the configured server), which
// navigations and new windows are allowed, which URLs open in the default browser, and which
// permissions are granted.

import { APP_HOST, APP_SCHEME } from './appFiles.ts';

/** The web app's CSP (apps/server), with connect-src limited to the app and the server URL. */
export function contentSecurityPolicy(serverUrl: string | null): string {
  // blob: so the video tool's worker can fetch its own verified wasm from a blob URL.
  const connect = ["'self'", 'blob:', ...(serverUrl ? [new URL(serverUrl).origin] : [])];
  return [
    "default-src 'self'",
    // blob: for the ffmpeg core, which is verified, cached and then imported from a blob URL.
    "script-src 'self' 'wasm-unsafe-eval' blob:",
    "worker-src 'self' blob:",
    `connect-src ${connect.join(' ')}`,
    "img-src 'self' data: blob:",
    "media-src 'self' blob: data:",
    "font-src 'self' data:",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ].join('; ');
}

/**
 * True for clearly://app URLs. Compared by protocol and host: Node's URL parser treats clearly: as
 * a non-special scheme, whose origin is the string "null" (found by the unit tests).
 */
export function isAppUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === `${APP_SCHEME}:` && u.host === APP_HOST;
  } catch {
    return false;
  }
}

/** In-app navigation stays on clearly://app; nothing else loads in a Clearly window. */
export function isAllowedNavigation(url: string): boolean {
  return isAppUrl(url);
}

/** Links that may open in the default browser: https only. */
export function isExternalAllowed(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Permissions Clearly may have, and only for its own origin: microphone and screen capture. */
const GRANTED = new Set(['media', 'display-capture']);

export function isPermissionGranted(permission: string, requestingUrl: string): boolean {
  return GRANTED.has(permission) && isAppUrl(requestingUrl);
}
