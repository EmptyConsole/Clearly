import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BuildRequiredError,
  fetchAsset,
  parseManifest,
  resolveDestination,
  sha256OfBuffer,
  type HeavyAsset,
} from './heavy.ts';

const payload = new TextEncoder().encode('pretend wasm bytes');
const goodHash = sha256OfBuffer(payload);

function asset(overrides: Partial<HeavyAsset> = {}): HeavyAsset {
  return {
    name: 'demo',
    version: '1.0.0',
    url: 'https://example.invalid/demo.wasm',
    sha256: goodHash,
    bytes: payload.length,
    destination: 'demo/demo.wasm',
    licence: 'MIT',
    ...overrides,
  };
}

const fakeFetch =
  (body: Uint8Array, status = 200): typeof fetch =>
  () =>
    Promise.resolve(new Response(new Blob([new Uint8Array(body)]), { status }));

describe('heavy manifest', () => {
  it('computes SHA-256 correctly for a known vector', () => {
    // SHA-256("abc") from FIPS 180-2.
    expect(sha256OfBuffer(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('accepts the empty manifest and rejects bad entries', () => {
    expect(parseManifest({ schemaVersion: 1, assets: [] }).assets).toEqual([]);
    expect(() => parseManifest({ schemaVersion: 1, assets: [asset({ sha256: 'abc' })] })).toThrow();
    expect(() =>
      parseManifest({ schemaVersion: 1, assets: [asset({ url: 'http://x.test/a' })] }),
    ).toThrow();
    expect(() => parseManifest({ schemaVersion: 2, assets: [] })).toThrow();
  });

  it('takes exactly one of url or build, and build must be a script under scripts/', () => {
    const noUrl = asset();
    delete noUrl.url;
    expect(
      parseManifest({ schemaVersion: 1, assets: [{ ...noUrl, build: 'scripts/x/build.sh' }] })
        .assets[0]?.build,
    ).toBe('scripts/x/build.sh');
    expect(() => parseManifest({ schemaVersion: 1, assets: [noUrl] })).toThrow();
    // Both: a prebuilt copy to download, and the script that makes it.
    expect(
      parseManifest({ schemaVersion: 1, assets: [asset({ build: 'scripts/x/build.sh' })] })
        .assets[0]?.url,
    ).toBe('https://example.invalid/demo.wasm');
    expect(() =>
      parseManifest({ schemaVersion: 1, assets: [{ ...noUrl, build: '../evil.sh' }] }),
    ).toThrow();
  });

  it('refuses destinations outside the heavy folder', () => {
    expect(() => resolveDestination('/repo', '../../src/main.ts')).toThrow();
    expect(() => resolveDestination('/repo', '/etc/passwd')).toThrow();
    expect(resolveDestination('/repo', 'a/b.wasm')).toBe('/repo/apps/web/public/heavy/a/b.wasm');
  });
});

describe('fetchAsset', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'clearly-heavy-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('downloads, verifies and then skips when already present', async () => {
    expect(await fetchAsset(root, asset(), fakeFetch(payload))).toBe('downloaded');
    const written = await readFile(join(root, 'apps/web/public/heavy/demo/demo.wasm'));
    expect(sha256OfBuffer(written)).toBe(goodHash);
    expect(await fetchAsset(root, asset(), fakeFetch(new Uint8Array()))).toBe('already-present');
  });

  it('never downloads a built asset: missing or stale means build it', async () => {
    const noUrl = asset();
    delete noUrl.url;
    const built: HeavyAsset = { ...noUrl, build: 'scripts/x/build.sh' };
    await expect(fetchAsset(root, built, fakeFetch(payload))).rejects.toBeInstanceOf(
      BuildRequiredError,
    );
  });

  it('downloads a prebuilt copy of a built asset, and asks for a build when it is missing', async () => {
    const both: HeavyAsset = asset({ build: 'scripts/x/build.sh' });
    expect(await fetchAsset(root, both, fakeFetch(payload))).toBe('downloaded');
    const missing: HeavyAsset = asset({ build: 'scripts/x/build.sh', destination: 'demo/b.wasm' });
    await expect(fetchAsset(root, missing, fakeFetch(payload, 404))).rejects.toBeInstanceOf(
      BuildRequiredError,
    );
  });

  it('fails on checksum mismatch and writes nothing', async () => {
    await expect(
      fetchAsset(root, asset(), fakeFetch(new TextEncoder().encode('tampered'))),
    ).rejects.toThrow(/checksum mismatch/);
    await expect(readFile(join(root, 'apps/web/public/heavy/demo/demo.wasm'))).rejects.toThrow();
  });

  it('fails on HTTP errors', async () => {
    await expect(fetchAsset(root, asset(), fakeFetch(payload, 404))).rejects.toThrow(/HTTP 404/);
  });
});
