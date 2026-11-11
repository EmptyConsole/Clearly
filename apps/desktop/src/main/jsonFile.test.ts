import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce, readJson, writeAtomic } from './jsonFile.ts';

describe('atomic JSON files and the backup debounce', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'clearly-json-'));
  });
  afterEach(async () => {
    vi.useRealTimers();
    await rm(dir, { recursive: true, force: true });
  });

  it('writes through a temporary file and leaves nothing else behind', async () => {
    const file = join(dir, 'sub', 'profile-backup.json');
    await writeAtomic(file, JSON.stringify({ a: 1 }));
    await writeAtomic(file, JSON.stringify({ a: 2 }));
    expect(await readJson(file)).toEqual({ a: 2 });
    expect(await readdir(join(dir, 'sub'))).toEqual(['profile-backup.json']);
    expect(await readJson(join(dir, 'missing.json'))).toBeNull();
  });

  it('debounces to the last call, and flush writes at once', async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const d = debounce(1000, (n: number) => {
      calls.push(n);
      return Promise.resolve();
    });
    d(1);
    d(2);
    d(3);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual([3]);
    d(4);
    await d.flush();
    expect(calls).toEqual([3, 4]);
  });
});
