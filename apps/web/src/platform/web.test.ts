import { describe, expect, it } from 'vitest';
import { detectCapabilities, type DetectEnv } from './web.ts';

function env(o: { constraints?: Record<string, boolean>; coarse?: boolean }): DetectEnv {
  const mediaDevices = {
    getDisplayMedia: () => Promise.reject(new Error('unused')),
    getUserMedia: () => Promise.reject(new Error('unused')),
    getSupportedConstraints: () => o.constraints ?? {},
  };
  const window = {
    matchMedia: (q: string) => ({
      matches:
        q === '(pointer: coarse)'
          ? o.coarse === true
          : q === '(any-pointer: fine)'
            ? !o.coarse
            : false,
    }),
  };
  return {
    navigator: { mediaDevices } as unknown as Navigator,
    window: window as unknown as Window,
    document: {} as Document,
  };
}

describe('tab audio capture detection', () => {
  it('needs getDisplayMedia and the tab-audio constraint', () => {
    expect(
      detectCapabilities(env({ constraints: { suppressLocalAudioPlayback: true } }))
        .tabAudioCapture,
    ).toBe(true);
  });

  it('is off where getDisplayMedia exists without tab audio (Firefox, Safari)', () => {
    expect(
      detectCapabilities(env({ constraints: { echoCancellation: true } })).tabAudioCapture,
    ).toBe(false);
  });

  it('is off on a phone (coarse pointer only), whatever the constraints', () => {
    expect(
      detectCapabilities(env({ constraints: { suppressLocalAudioPlayback: true }, coarse: true }))
        .tabAudioCapture,
    ).toBe(false);
  });
});
