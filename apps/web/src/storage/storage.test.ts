import { FIXTURES } from '@clearly/core/testing';
import { BACKUP, HEARING_CHECK, PROFILE, migrate } from '@clearly/core';
import { describe, expect, it } from 'vitest';
import {
  applyBackup,
  backupBlob,
  buildBackup,
  parseBackup,
  previewBackup,
  BackupFileError,
} from './backup.ts';
import { ClearlyDb } from './db.ts';
import { fileHash } from './fileHash.ts';
import { appSettings, exposureDays, hearingChecks, kv, profiles } from './repos.ts';
import { decodeShareFragment, encodeShareFragment } from './shareLink.ts';

const profile = () => migrate(PROFILE, FIXTURES['Profile']?.[1]);

describe('backup file', () => {
  it('round-trips through a file and replaces local data after confirmation', async () => {
    await profiles.put(profile());
    await hearingChecks.put(migrate(HEARING_CHECK, FIXTURES['HearingCheck']?.[1]));
    await kv.set('activeProfileId', 'p-1');
    await appSettings.put({ ...(await appSettings.get()), preset: 'speech' });
    await exposureDays.put({
      schemaVersion: 1,
      id: '2026-11-09',
      comfortableMinutes: 5,
      loudMinutes: 1,
      veryLoudMinutes: 0,
      alerted: false,
    });
    const without = await buildBackup({ includeHistory: false });
    expect(without.exposureDays).toBeUndefined();
    const doc = await buildBackup({ includeHistory: true });
    const text = await backupBlob(doc).text();
    const parsed = parseBackup(text);
    expect(parsed).toEqual(doc);
    expect(previewBackup(parsed)).toMatchObject({
      profiles: 1,
      hearingChecks: 1,
      exposureDays: 1,
      profileNames: ['Evening TV'],
    });
    await profiles.clear();
    await hearingChecks.clear();
    await applyBackup(parsed);
    expect(await profiles.list()).toHaveLength(1);
    expect(await hearingChecks.list()).toHaveLength(1);
    expect((await appSettings.get()).preset).toBe('speech');
    expect(await kv.get('activeProfileId')).toBe('p-1');
  });

  it('migrates the v1 fixture and rejects other files', () => {
    const b = migrate(BACKUP, FIXTURES['Backup']?.[1]);
    expect(b.sinChecks).toEqual([]);
    expect(() => parseBackup('not json')).toThrow(BackupFileError);
    expect(() => parseBackup('{"kind":"something-else"}')).toThrow(BackupFileError);
    expect(() => parseBackup(JSON.stringify({ ...b, profiles: [{ id: 1 }] }))).toThrow(
      BackupFileError,
    );
    expect(() => parseBackup(JSON.stringify({ ...b, schemaVersion: 99 }))).toThrow(BackupFileError);
  });
});

describe('share link', () => {
  it('encodes and decodes a profile', () => {
    const p = profile();
    const frag = encodeShareFragment(p);
    expect(frag).toMatch(/^p=[A-Za-z0-9_-]+$/);
    expect(decodeShareFragment(`#${frag}`)).toEqual(p);
  });
  it('rejects tampered, truncated and invalid input', () => {
    const frag = encodeShareFragment(profile());
    const body = frag.slice(2);
    const flipped = body.slice(0, 20) + (body[20] === 'A' ? 'B' : 'A') + body.slice(21);
    expect(decodeShareFragment(`#p=${flipped}`)).toBeNull();
    expect(decodeShareFragment(`#p=${body.slice(0, body.length - 10)}`)).toBeNull();
    expect(decodeShareFragment('#p=***')).toBeNull();
    expect(decodeShareFragment('#q=abc')).toBeNull();
    expect(decodeShareFragment('')).toBeNull();
    expect(decodeShareFragment(`#p=${'A'.repeat(20000)}`)).toBeNull();
  });
});

describe('database migrations and file hash', () => {
  it('opens a version-1 database written by M03 and upgrades it to version 2', async () => {
    const name = `upgrade-${Math.random()}`;
    // A version-1 database exactly as M03 created it.
    const { default: Dexie } = await import('dexie');
    const v1 = new Dexie(name);
    v1.version(1).stores({
      profiles: 'id',
      hearingChecks: 'id, profileId, createdAt',
      kv: 'key',
      checkProgress: 'id, expiresAt',
    });
    await v1.table('profiles').put(FIXTURES['Profile']?.[1]);
    v1.close();
    const v2 = new ClearlyDb(name);
    await v2.open();
    expect(v2.verno).toBe(2);
    expect(await v2.profiles.count()).toBe(1);
    expect(await v2.sinChecks.count()).toBe(0);
    v2.close();
  });

  it('hashes the first and last megabyte plus the size', async () => {
    const big = new Uint8Array(3 * 1024 * 1024);
    const a = await fileHash(new Blob([big]));
    big[1024 * 1024 + 5] = 1; // middle byte: not read
    expect(await fileHash(new Blob([big]))).toBe(a);
    big[10] = 1; // first megabyte
    expect(await fileHash(new Blob([big]))).not.toBe(a);
    expect(await fileHash(new Blob([new Uint8Array(10)]))).toMatch(/^sha256-[0-9a-f]{64}$/);
  });
});
