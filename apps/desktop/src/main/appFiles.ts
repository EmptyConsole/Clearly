// Serving the built web app on clearly://app (M12): URL to file path with path-traversal checks,
// MIME types (including application/wasm), byte ranges for media seeking, and the single-page app
// fallback to index.html. No Electron import, so it is unit-tested in Node.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';

export const APP_SCHEME = 'clearly';
export const APP_HOST = 'app';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
  '.xz': 'application/x-xz',
};

export function mimeFor(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

export type Resolved =
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'spa' }
  | { readonly kind: 'forbidden' };

/**
 * Maps a clearly://app URL to a file under `root`. Anything that would leave root (encoded or not,
 * either slash, NUL bytes, another host) is forbidden. Paths without an extension are app routes
 * and get the index.html fallback.
 */
export function resolveAppPath(root: string, url: string): Resolved {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { kind: 'forbidden' };
  }
  if (u.protocol !== `${APP_SCHEME}:` || u.host !== APP_HOST) return { kind: 'forbidden' };
  let path: string;
  try {
    path = decodeURIComponent(u.pathname);
  } catch {
    return { kind: 'forbidden' };
  }
  if (path.includes('\0') || path.includes('\\')) return { kind: 'forbidden' };
  const segments = path.split('/').filter((s) => s !== '');
  if (segments.some((s) => s === '..' || s === '.')) return { kind: 'forbidden' };
  if (segments.length === 0) return { kind: 'file', path: resolve(root, 'index.html') };
  const full = resolve(root, ...segments);
  const rel = relative(resolve(root), full);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('..'))
    return { kind: 'forbidden' };
  if (extname(full) === '') return { kind: 'spa' };
  return { kind: 'file', path: full };
}

/** Parses a single "bytes=a-b" range against a file size; null when absent or unsatisfiable. */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | 'invalid' | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return 'invalid';
  const [, a = '', b = ''] = m;
  if (a === '' && b === '') return 'invalid';
  let start: number;
  let end: number;
  if (a === '') {
    const suffix = Number(b);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(a);
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
  }
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}

/** Security headers for every app response (the CSP itself comes from security.ts). */
export interface ServeOptions {
  readonly csp: string;
}

async function fileResponse(path: string, request: Request, o: ServeOptions): Promise<Response> {
  let size: number;
  try {
    const st = await stat(path);
    if (!st.isFile()) return new Response('Not found', { status: 404 });
    size = st.size;
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const headers = new Headers({
    'Content-Type': mimeFor(path),
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
  });
  if (path.endsWith('.html')) headers.set('Content-Security-Policy', o.csp);
  const range = parseRange(request.headers.get('Range'), size);
  if (range === 'invalid') {
    headers.set('Content-Range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  headers.set('Content-Length', String(size === 0 ? 0 : end - start + 1));
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  if (request.method === 'HEAD' || size === 0)
    return new Response(null, { status: range ? 206 : 200, headers });
  const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(body, { status: range ? 206 : 200, headers });
}

export async function serveApp(root: string, request: Request, o: ServeOptions): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response('Method not allowed', { status: 405 });
  const r = resolveAppPath(root, request.url);
  if (r.kind === 'forbidden') return new Response('Forbidden', { status: 403 });
  if (r.kind === 'spa') return fileResponse(resolve(root, 'index.html'), request, o);
  return fileResponse(r.path, request, o);
}
