// Tokens, restore codes and payload encryption.
//   Tokens: 256 random bits, base64url. Only SHA-256(token) is stored.
//   Restore codes: 60 bits (12 Crockford characters). Stored as HMAC-SHA-256 with a server-side
//     pepper, because 60 bits is too few to resist brute force on a plain hash if the database
//     leaked.
//   Payloads: AES-256-GCM, 96-bit random IV, 128-bit tag, stored with the key id so keys can be
//     rotated (docs/PRIVACY.txt).

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { encodeRestoreCode } from '@clearly/core';
import type { EncryptionKey } from './config.ts';

export const newToken = (): string => randomBytes(32).toString('base64url');
export const newId = (): string => randomBytes(16).toString('base64url');
export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
export const newRestoreCode = (): string => encodeRestoreCode(randomBytes(8));
export const hmacCode = (code: string, pepper: string): string =>
  createHmac('sha256', pepper).update(code).digest('hex');

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface Sealed {
  readonly keyId: string;
  /** iv (12) || tag (16) || ciphertext */
  readonly blob: Buffer;
}

export function seal(plaintext: string, key: EncryptionKey): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key.key, iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { keyId: key.id, blob: Buffer.concat([iv, cipher.getAuthTag(), body]) };
}

export function open(sealed: Sealed, keys: readonly EncryptionKey[]): string {
  const key = keys.find((k) => k.id === sealed.keyId);
  if (!key) throw new Error(`no key with id ${sealed.keyId}`);
  const iv = sealed.blob.subarray(0, 12);
  const tag = sealed.blob.subarray(12, 28);
  const body = sealed.blob.subarray(28);
  const d = createDecipheriv('aes-256-gcm', key.key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString('utf8');
}
