import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mimeFor, parseRange, resolveAppPath, serveApp } from './appFiles.ts';

const ROOT = '/srv/web';

describe('resolveAppPath: path traversal', () => {
  it.each([
    'clearly://app/../secret.txt',
    'clearly://app/%2e%2e/secret.txt',
    'clearly://app/a/../../../x.txt',
  ])('%s stays inside the root (the URL parser removes dot segments first)', (url) => {
    const r = resolveAppPath(ROOT, url);
    expect(r.kind).toBe('file');
    if (r.kind === 'file') expect(r.path.startsWith(`${resolve(ROOT)}/`)).toBe(true);
  });

  it.each([
    'clearly://app/%2E%2E%2Fsecret.txt',
    'clearly://app/assets/..%2f..%2fsecret',
    'clearly://app/assets/%2e%2e%5csecret',
    'clearly://app/a%00.js',
    'clearly://app/%ZZ',
    'clearly://evil/index.html',
    'https://app/index.html',
    'not a url',
  ])('refuses %s', (url) => {
    expect(resolveAppPath(ROOT, url).kind).toBe('forbidden');
  });

  it('serves files inside the root and falls back to index.html for routes', () => {
    expect(resolveAppPath(ROOT, 'clearly://app/')).toEqual({
      kind: 'file',
      path: resolve(ROOT, 'index.html'),
    });
    expect(resolveAppPath(ROOT, 'clearly://app/assets/app-1.js')).toEqual({
      kind: 'file',
      path: resolve(ROOT, 'assets/app-1.js'),
    });
    expect(resolveAppPath(ROOT, 'clearly://app/audio/player?x=1').kind).toBe('spa');
    expect(resolveAppPath(ROOT, 'clearly://app/more/settings#desktop').kind).toBe('spa');
  });
});

describe('MIME types', () => {
  it.each([
    ['a.wasm', 'application/wasm'],
    ['a.js', 'text/javascript; charset=utf-8'],
    ['a.mjs', 'text/javascript; charset=utf-8'],
    ['index.html', 'text/html; charset=utf-8'],
    ['a.css', 'text/css; charset=utf-8'],
    ['m.webmanifest', 'application/manifest+json'],
    ['clip.webm', 'audio/webm'],
    ['x.WOFF2', 'font/woff2'],
    ['unknown.bin', 'application/octet-stream'],
  ])('%s is %s', (file, mime) => {
    expect(mimeFor(file)).toBe(mime);
  });
});

describe('parseRange', () => {
  it('handles the usual forms and refuses impossible ranges', () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=50-500', 100)).toEqual({ start: 50, end: 99 });
    expect(parseRange('bytes=100-', 100)).toBe('invalid');
    expect(parseRange('bytes=9-1', 100)).toBe('invalid');
    expect(parseRange('items=0-1', 100)).toBe('invalid');
  });
});

describe('serveApp', () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'clearly-app-'));
    await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'index.html'), '<!doctype html><title>Clearly</title>');
    await writeFile(
      join(root, 'assets', 'core.wasm'),
      new Uint8Array([0, 97, 115, 109, 1, 2, 3, 4]),
    );
    await writeFile(join(tmpdir(), 'clearly-secret.txt'), 'secret');
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const o = { csp: "default-src 'self'" };

  it('serves wasm with its MIME type and byte ranges for seeking', async () => {
    const full = await serveApp(root, new Request('clearly://app/assets/core.wasm'), o);
    expect(full.status).toBe(200);
    expect(full.headers.get('Content-Type')).toBe('application/wasm');
    expect(new Uint8Array(await full.arrayBuffer())).toHaveLength(8);
    const part = await serveApp(
      root,
      new Request('clearly://app/assets/core.wasm', { headers: { Range: 'bytes=4-' } }),
      o,
    );
    expect(part.status).toBe(206);
    expect(part.headers.get('Content-Range')).toBe('bytes 4-7/8');
    expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([1, 2, 3, 4]);
  });

  it('gives routes index.html with the CSP, and 404, 403 and 405 where they belong', async () => {
    const route = await serveApp(root, new Request('clearly://app/audio/player'), o);
    expect(route.status).toBe(200);
    expect(route.headers.get('Content-Security-Policy')).toBe(o.csp);
    expect(await route.text()).toContain('Clearly');
    expect((await serveApp(root, new Request('clearly://app/assets/none.js'), o)).status).toBe(404);
    // A file next to the root is never reachable: dot segments resolve inside the root (404),
    // and encoded slashes are refused (403).
    expect(
      (await serveApp(root, new Request('clearly://app/%2e%2e/clearly-secret.txt'), o)).status,
    ).toBe(404);
    expect(
      (await serveApp(root, new Request('clearly://app/%2e%2e%2fclearly-secret.txt'), o)).status,
    ).toBe(403);
    expect(
      (await serveApp(root, new Request('clearly://app/index.html', { method: 'POST' }), o)).status,
    ).toBe(405);
  });
});
