// Restore codes (M04): 12 Crockford base32 characters (60 bits), shown as XXXX-XXXX-XXXX.
// Input accepts lower case, spaces and hyphens, and the confusables I/L (read as 1) and O (read
// as 0), as Crockford's base32 specifies (https://www.crockford.com/base32.html).
// The server stores codes only as HMAC-SHA-256 with a secret pepper (apps/server).

export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RESTORE_CODE_LENGTH = 12;
export const RESTORE_CODE_BITS = RESTORE_CODE_LENGTH * 5;
/** Restore codes are valid for 24 hours and one use. */
export const RESTORE_CODE_TTL_MS = 24 * 60 * 60 * 1000;

/** Encodes 60 bits from the first 8 bytes of `bytes` (the top 4 bits of byte 7 are unused). */
export function encodeRestoreCode(bytes: Uint8Array): string {
  if (bytes.length < 8) throw new Error('a restore code needs 8 random bytes');
  let value = 0n;
  for (let i = 0; i < 8; i++) value = (value << 8n) | BigInt(bytes[i] ?? 0);
  value >>= 4n; // 64 - 60
  let out = '';
  // Most significant group first.
  for (let i = RESTORE_CODE_LENGTH - 1; i >= 0; i--) {
    out += CROCKFORD_ALPHABET[Number((value >> BigInt(i * 5)) & 31n)] ?? '0';
  }
  return out;
}

/**
 * Normalises typed input to the 12-character canonical form, or returns null if it is not a valid
 * code. Hyphens and spaces are ignored; I and L read as 1, O as 0; U is not in the alphabet.
 */
export function normaliseRestoreCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  if (cleaned.length !== RESTORE_CODE_LENGTH) return null;
  for (const ch of cleaned) if (!CROCKFORD_ALPHABET.includes(ch)) return null;
  return cleaned;
}

/** XXXX-XXXX-XXXX. */
export function formatRestoreCode(code: string): string {
  const c = normaliseRestoreCode(code);
  if (!c) throw new Error('not a restore code');
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}

export function isValidRestoreCode(input: string): boolean {
  return normaliseRestoreCode(input) !== null;
}
