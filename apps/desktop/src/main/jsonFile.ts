// Small JSON files in the user-data folder (window state, caption window positions, settings, the
// automatic backup). Written atomically: a temporary file in the same folder, then rename, so a
// crash never leaves half a file. No Electron import (unit-tested).

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function writeAtomic(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temp, text, 'utf8');
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}

export async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

/** Calls `run` once `ms` after the last call (the automatic backup is debounced this way). */
export function debounce<A extends unknown[]>(
  ms: number,
  run: (...args: A) => Promise<void>,
): { (...args: A): void; flush(): Promise<void> } {
  let timer: NodeJS.Timeout | null = null;
  let pending: A | null = null;
  const fire = async () => {
    timer = null;
    const args = pending;
    pending = null;
    if (args) await run(...args);
  };
  const call = (...args: A) => {
    pending = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void fire(), ms);
  };
  call.flush = async () => {
    if (timer) clearTimeout(timer);
    await fire();
  };
  return call;
}
