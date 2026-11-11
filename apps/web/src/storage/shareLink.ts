// "Share my profile link": one profile, deflated with fflate and encoded as base64url in the URL
// fragment (#p=...), so it never reaches a server. The receiver validates it with zod before
// showing a preview and asking to import.

import { PROFILE, migrate, type Profile } from '@clearly/core';
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

export const SHARE_PATH = '/share';
export const SHARE_PARAM = 'p';
/** Links over this length are refused (the profile JSON compresses to well under it). */
export const SHARE_MAX_CHARS = 16_000;

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('not base64url');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeShareFragment(profile: Profile): string {
  const json = JSON.stringify(PROFILE.schema.parse(profile));
  return `${SHARE_PARAM}=${toBase64Url(deflateSync(strToU8(json), { level: 9 }))}`;
}

export function shareUrl(origin: string, profile: Profile): string {
  return `${origin}${SHARE_PATH}#${encodeShareFragment(profile)}`;
}

/** Returns the validated profile, or null for anything missing, tampered or invalid. */
export function decodeShareFragment(hash: string): Profile | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (h.length > SHARE_MAX_CHARS) return null;
  const value = new URLSearchParams(h).get(SHARE_PARAM);
  if (!value) return null;
  try {
    const json = strFromU8(inflateSync(fromBase64Url(value)));
    return migrate(PROFILE, JSON.parse(json));
  } catch {
    return null;
  }
}
