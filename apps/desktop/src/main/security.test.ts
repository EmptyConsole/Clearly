import { describe, expect, it } from 'vitest';
import { loopbackSupport } from './capture.ts';
import {
  contentSecurityPolicy,
  isAllowedNavigation,
  isExternalAllowed,
  isPermissionGranted,
} from './security.ts';
import { isVisibleOn, restoreState } from './windowState.ts';

describe('desktop security rules', () => {
  it('limits connect-src to the app and the configured server', () => {
    expect(contentSecurityPolicy(null)).toContain("connect-src 'self' blob:;");
    const csp = contentSecurityPolicy('https://api.example.com/base/');
    expect(csp).toContain("connect-src 'self' blob: https://api.example.com;");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('keeps navigation on clearly://app and opens only https outside', () => {
    expect(isAllowedNavigation('clearly://app/audio')).toBe(true);
    expect(isAllowedNavigation('https://example.com')).toBe(false);
    expect(isAllowedNavigation('clearly://other/')).toBe(false);
    expect(isAllowedNavigation('file:///etc/passwd')).toBe(false);
    expect(isExternalAllowed('https://vb-audio.com/Cable/')).toBe(true);
    expect(isExternalAllowed('http://example.com')).toBe(false);
    expect(isExternalAllowed('file:///Applications')).toBe(false);
    expect(isExternalAllowed('javascript:alert(1)')).toBe(false);
  });

  it('grants only the microphone and screen capture, and only to the app', () => {
    expect(isPermissionGranted('media', 'clearly://app/')).toBe(true);
    expect(isPermissionGranted('display-capture', 'clearly://app')).toBe(true);
    expect(isPermissionGranted('geolocation', 'clearly://app/')).toBe(false);
    expect(isPermissionGranted('notifications', 'clearly://app/')).toBe(false);
    expect(isPermissionGranted('media', 'https://evil.example/')).toBe(false);
  });

  it('reports loopback support per OS as documented for Electron 45', () => {
    expect(loopbackSupport('win32')).toEqual({ os: 'windows', system: true, withMute: false });
    expect(loopbackSupport('darwin')).toEqual({ os: 'macos', system: false, withMute: false });
    expect(loopbackSupport('linux').system).toBe(false);
  });
});

describe('window state', () => {
  const screenArea = { x: 0, y: 0, width: 1440, height: 900 };
  it('restores a window that is still on screen, and drops one that is not', () => {
    const saved = { bounds: { x: 100, y: 100, width: 1200, height: 800 }, maximized: false };
    expect(restoreState(saved, [screenArea])).toEqual(saved);
    expect(
      restoreState({ bounds: { x: 3000, y: 100, width: 1200, height: 800 }, maximized: false }, [
        screenArea,
      ]),
    ).toBeNull();
    expect(restoreState({ nonsense: true }, [screenArea])).toBeNull();
    expect(isVisibleOn({ x: 1390, y: 0, width: 400, height: 400 }, [screenArea])).toBe(false);
  });
});
