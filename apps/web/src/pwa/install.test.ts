import { describe, expect, it } from 'vitest';
import { installOffer } from './install.ts';

const base = {
  hasPromptEvent: false,
  standalone: false,
  manualA2hs: false,
  checksDone: 1,
  alreadyShown: false,
};

describe('install offer', () => {
  it('offers the install banner after the first completed check where the event fired', () => {
    expect(installOffer({ ...base, hasPromptEvent: true })).toBe('prompt');
    expect(installOffer({ ...base, hasPromptEvent: true, checksDone: 0 })).toBeNull();
  });
  it('shows manual steps only where there is no event and Add to Home Screen exists', () => {
    expect(installOffer({ ...base, manualA2hs: true })).toBe('manual');
    expect(installOffer(base)).toBeNull();
  });
  it('never when installed or already shown once', () => {
    expect(installOffer({ ...base, hasPromptEvent: true, standalone: true })).toBeNull();
    expect(installOffer({ ...base, manualA2hs: true, alreadyShown: true })).toBeNull();
  });
});
