import { FIXTURES } from '@clearly/core/testing';
import { SIN_CHECK, migrate } from '@clearly/core';
import { describe, expect, it } from 'vitest';
import { cleanupHintDue } from './cleanupHint.ts';

const some = migrate(SIN_CHECK, FIXTURES['SinCheck']?.[1]);
const good = {
  ...some,
  id: 'good',
  category: 'good' as const,
  createdAt: '2026-11-10T00:00:00.000Z',
};

describe('cleanup hint chip', () => {
  it('shows after a poor speech-in-noise result, once', () => {
    expect(cleanupHintDue([some], false, false)).toBe(true);
    expect(cleanupHintDue([some], false, true)).toBe(false);
    expect(cleanupHintDue([some], true, false)).toBe(false);
  });
  it('uses the latest result and stays hidden with none', () => {
    expect(cleanupHintDue([some, good], false, false)).toBe(false);
    expect(cleanupHintDue([], false, false)).toBe(false);
  });
});
