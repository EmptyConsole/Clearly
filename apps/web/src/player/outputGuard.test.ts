import { describe, expect, it } from 'vitest';
import { outputMayBeLost } from './outputGuard.ts';

describe('outputMayBeLost', () => {
  it('pauses when a known output disappears, not when one is added', () => {
    expect(outputMayBeLost({ ids: ['spk', 'hp'] }, { ids: ['spk'] })).toBe(true);
    expect(outputMayBeLost({ ids: ['spk'] }, { ids: ['spk', 'hp'] })).toBe(false);
    expect(outputMayBeLost({ ids: ['spk', 'hp'] }, { ids: ['hp', 'spk'] })).toBe(false);
  });

  it('pauses on any change when the browser hides device ids (no permission)', () => {
    expect(outputMayBeLost({ ids: [''] }, { ids: [''] })).toBe(true);
    expect(outputMayBeLost({ ids: [] }, { ids: ['spk'] })).toBe(true);
  });
});
