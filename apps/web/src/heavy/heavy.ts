// Heavy downloads (RULES.md): served from /heavy/ on the app's own origin, listed with their real
// size in heavy-manifest.json, fetched only after an explicit tap, verified against the manifest's
// SHA-256, and kept with the Cache API so they work offline afterwards.

import manifest from '../../../../heavy-manifest.json';

export const HEAVY_CACHE = 'clearly-heavy-v1';

/**
 * The Cache API key for a /heavy/ URL. The Cache API accepts only http(s) requests, so in the
 * desktop app (clearly://app) the key is the same path on a fixed https origin that is never
 * fetched. On the web the key is the URL itself, as before.
 */
export function heavyCacheKey(url: string): string {
  const here = typeof location !== 'undefined' ? location.href : 'https://clearly.invalid/';
  const abs = new URL(url, here);
  return abs.protocol === 'https:' || abs.protocol === 'http:'
    ? url
    : `https://app.clearly.invalid${abs.pathname}`;
}

export interface HeavyInfo {
  readonly name: string;
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
}

export function heavyInfo(name: string): HeavyInfo {
  const a = manifest.assets.find((x) => x.name === name);
  if (!a) throw new Error(`no heavy asset ${name}`);
  return { name: a.name, url: `/heavy/${a.destination}`, bytes: a.bytes, sha256: a.sha256 };
}

export class HeavyDownloadError extends Error {
  constructor(
    readonly reason: 'network' | 'checksum' | 'storage',
    message: string,
  ) {
    super(message);
    this.name = 'HeavyDownloadError';
  }
}

/** True on a cellular or data-saver connection, where the person is asked to confirm. */
export function isMeteredConnection(): boolean {
  const c = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } })
    .connection;
  return Boolean(c && (c.saveData === true || c.type === 'cellular'));
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

const hasCaches = (): boolean => typeof caches !== 'undefined';

export async function isCached(info: HeavyInfo): Promise<boolean> {
  if (!hasCaches()) return false;
  try {
    const cache = await caches.open(HEAVY_CACHE);
    return (await cache.match(heavyCacheKey(info.url))) !== undefined;
  } catch {
    return false;
  }
}

/** The cached bytes, or null. */
export async function readCached(info: HeavyInfo): Promise<ArrayBuffer | null> {
  if (!hasCaches()) return null;
  try {
    const r = await (await caches.open(HEAVY_CACHE)).match(heavyCacheKey(info.url));
    return r ? await r.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Downloads with progress (0 to 1), verifies the checksum, and caches it. */
export async function download(
  info: HeavyInfo,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  let res: Response;
  try {
    res = await fetch(info.url, { cache: 'no-store', ...(signal ? { signal } : {}) });
  } catch {
    throw new HeavyDownloadError('network', 'the download could not start');
  }
  if (!res.ok || !res.body) throw new HeavyDownloadError('network', `HTTP ${res.status}`);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onProgress(Math.min(1, got / info.bytes));
  }
  const data = new Uint8Array(got);
  let o = 0;
  for (const p of parts) {
    data.set(p, o);
    o += p.length;
  }
  if ((await sha256Hex(data.buffer)) !== info.sha256) {
    throw new HeavyDownloadError('checksum', 'the file did not match its checksum');
  }
  if (hasCaches()) {
    try {
      await (
        await caches.open(HEAVY_CACHE)
      ).put(
        heavyCacheKey(info.url),
        new Response(data, { headers: { 'Content-Type': 'application/wasm' } }),
      );
    } catch {
      // Storage full or blocked: the module still works this session.
    }
  }
  return data.buffer;
}

export async function removeCached(info: HeavyInfo): Promise<void> {
  if (!hasCaches()) return;
  await (await caches.open(HEAVY_CACHE)).delete(heavyCacheKey(info.url));
}

export function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 2 : 1);
}
