import { describe, expect, it } from 'vitest';
import {
  encodeRestoreCode,
  formatRestoreCode,
  isValidRestoreCode,
  normaliseRestoreCode,
  CROCKFORD_ALPHABET,
} from './restoreCode.ts';

describe('restore codes', () => {
  it('encodes 60 bits as 12 Crockford characters', () => {
    expect(encodeRestoreCode(new Uint8Array(8))).toBe('000000000000');
    expect(encodeRestoreCode(new Uint8Array(8).fill(255))).toBe('ZZZZZZZZZZZZ');
    const c = encodeRestoreCode(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(c).toHaveLength(12);
    for (const ch of c) expect(CROCKFORD_ALPHABET).toContain(ch);
  });
  it('formats as XXXX-XXXX-XXXX', () => {
    expect(formatRestoreCode('ABCDEFGHJKMN')).toBe('ABCD-EFGH-JKMN');
  });
  it('accepts lower case, spaces, hyphens and the I/L/O confusables', () => {
    expect(normaliseRestoreCode('abcd-efgh-jkmn')).toBe('ABCDEFGHJKMN');
    expect(normaliseRestoreCode(' 0O1I L234 5678 ')).toBe('001112345678');
  });
  it('rejects wrong lengths and characters outside the alphabet', () => {
    expect(isValidRestoreCode('ABCD-EFGH-JKM')).toBe(false);
    expect(isValidRestoreCode('ABCD-EFGH-JKMU')).toBe(false);
    expect(isValidRestoreCode('ABCD-EFGH-JK!N')).toBe(false);
    expect(() => formatRestoreCode('nope')).toThrow();
  });
  it('round-trips random bytes through format and normalise', () => {
    for (let i = 0; i < 50; i++) {
      const bytes = new Uint8Array(8).map(() => Math.floor(Math.random() * 256));
      const code = encodeRestoreCode(bytes);
      expect(normaliseRestoreCode(formatRestoreCode(code).toLowerCase())).toBe(code);
    }
  });
});
