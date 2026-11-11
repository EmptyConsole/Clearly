import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildApp,
  MAX_PAYLOAD_BYTES,
  purgeExpiredCodes,
  purgeStaleProfiles,
  RESTORE_COOLDOWN_MS,
} from './app.ts';
import { loadConfig, parseTrustProxy, type Config } from './config.ts';
import { open, seal } from './crypto.ts';
import { openDb, type Db } from './db.ts';

const key = () => `k${randomBytes(2).toString('hex')}:${randomBytes(32).toString('base64')}`;

function testConfig(over: Partial<Record<string, string>> = {}): Config {
  return loadConfig({
    RESTORE_CODE_PEPPER: 'p'.repeat(40),
    PAYLOAD_ENCRYPTION_KEY: key(),
    DATABASE_PATH: ':memory:',
    ...over,
  });
}

let clock = Date.parse('2026-11-09T12:00:00Z');
let logs = '';
const apps: { close(): Promise<unknown> }[] = [];

async function setup(
  over: Partial<Record<string, string>> = {},
  db?: Db,
  restoreRateLimit?: number,
) {
  logs = '';
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      logs += chunk.toString();
      cb();
    },
  });
  const config = testConfig(over);
  const database = db ?? openDb(':memory:');
  const app = await buildApp({
    config,
    db: database,
    now: () => clock,
    logStream: stream,
    ...(restoreRateLimit ? { restoreRateLimit } : {}),
  });
  apps.push(app);
  return { app, db: database, config };
}

afterEach(async () => {
  while (apps.length) await apps.pop()?.close();
  clock = Date.parse('2026-11-09T12:00:00Z');
});

const consent = { healthDataBackup: true, version: '2026-11' };
const payload = { kind: 'clearly-backup', profiles: [{ name: 'Evening TV' }] };

async function create(app: Awaited<ReturnType<typeof setup>>['app']) {
  const r = await app.inject({
    method: 'POST',
    url: '/api/profiles',
    payload: { payload, consent },
  });
  expect(r.statusCode).toBe(201);
  return r.json<{ id: string; token: string }>();
}
const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe('profiles', () => {
  it('requires consent', async () => {
    const { app } = await setup();
    const r = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: { payload, consent: { healthDataBackup: false, version: '1' } },
    });
    expect(r.statusCode).toBe(400);
    const r2 = await app.inject({ method: 'POST', url: '/api/profiles', payload: { payload } });
    expect(r2.statusCode).toBe(400);
  });

  it('creates, reads, updates with versions, and deletes', async () => {
    const { app } = await setup();
    const { id, token } = await create(app);
    const g = await app.inject({ method: 'GET', url: `/api/profiles/${id}`, headers: auth(token) });
    expect(g.statusCode).toBe(200);
    expect(g.json()).toMatchObject({ payload, version: 1 });
    const p = await app.inject({
      method: 'PUT',
      url: `/api/profiles/${id}`,
      headers: auth(token),
      payload: { payload: { ...payload, x: 1 }, baseVersion: 1 },
    });
    expect(p.json()).toEqual({ version: 2 });
    const d = await app.inject({
      method: 'DELETE',
      url: `/api/profiles/${id}`,
      headers: auth(token),
    });
    expect(d.statusCode).toBe(204);
    const g2 = await app.inject({
      method: 'GET',
      url: `/api/profiles/${id}`,
      headers: auth(token),
    });
    expect(g2.statusCode).toBe(404);
  });

  it('answers 401 without or with a wrong token, 404 for an unknown profile', async () => {
    const { app } = await setup();
    const { id } = await create(app);
    expect((await app.inject({ method: 'GET', url: `/api/profiles/${id}` })).statusCode).toBe(401);
    const wrong = randomBytes(32).toString('base64url');
    expect(
      (await app.inject({ method: 'GET', url: `/api/profiles/${id}`, headers: auth(wrong) }))
        .statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/api/profiles/nope', headers: auth(wrong) }))
        .statusCode,
    ).toBe(404);
  });

  it('answers 409 with the newer version on a stale write', async () => {
    const { app } = await setup();
    const { id, token } = await create(app);
    await app.inject({
      method: 'PUT',
      url: `/api/profiles/${id}`,
      headers: auth(token),
      payload: { payload: { v: 'a' }, baseVersion: 1 },
    });
    const r = await app.inject({
      method: 'PUT',
      url: `/api/profiles/${id}`,
      headers: auth(token),
      payload: { payload: { v: 'b' }, baseVersion: 1 },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ version: 2, payload: { v: 'a' } });
    expect(typeof r.json<{ updatedAt: string }>().updatedAt).toBe('string');
  });

  it('answers 413 for payloads over 256 KB', async () => {
    const { app } = await setup();
    const big = { blob: 'x'.repeat(MAX_PAYLOAD_BYTES) };
    const r = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: { payload: big, consent },
    });
    expect(r.statusCode).toBe(413);
  });

  it('stores payloads encrypted and reads them with an old key after rotation', async () => {
    const oldKey = key();
    const db = openDb(':memory:');
    const first = await setup({ PAYLOAD_ENCRYPTION_KEY: oldKey }, db);
    const { id, token } = await create(first.app);
    const raw = db
      .prepare<[string], { payload: Buffer }>('SELECT payload FROM profiles WHERE id = ?')
      .get(id);
    expect(raw?.payload.toString('utf8')).not.toContain('Evening TV');
    await first.app.close();
    const second = await setup(
      { PAYLOAD_ENCRYPTION_KEY: key(), PAYLOAD_ENCRYPTION_KEYS_OLD: oldKey },
      db,
    );
    const g = await second.app.inject({
      method: 'GET',
      url: `/api/profiles/${id}`,
      headers: auth(token),
    });
    expect(g.json()).toMatchObject({ payload });
  });

  it('round-trips AES-256-GCM and rejects tampering', () => {
    const k = testConfig().currentKey;
    const s = seal('hello', k);
    expect(open(s, [k])).toBe('hello');
    const bad = Buffer.from(s.blob);
    bad[bad.length - 1] = (bad[bad.length - 1] ?? 0) ^ 1;
    expect(() => open({ keyId: s.keyId, blob: bad }, [k])).toThrow();
  });

  it('rotates tokens: the new one works, all others stop', async () => {
    const { app } = await setup();
    const { id, token } = await create(app);
    const r = await app.inject({
      method: 'POST',
      url: `/api/profiles/${id}/rotate-token`,
      headers: auth(token),
    });
    const next = r.json<{ token: string }>().token;
    expect(
      (await app.inject({ method: 'GET', url: `/api/profiles/${id}`, headers: auth(token) }))
        .statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: `/api/profiles/${id}`, headers: auth(next) }))
        .statusCode,
    ).toBe(200);
  });
});

describe('restore codes', () => {
  async function code(app: Awaited<ReturnType<typeof setup>>['app'], id: string, token: string) {
    const r = await app.inject({
      method: 'POST',
      url: `/api/profiles/${id}/restore-code`,
      headers: auth(token),
    });
    return r.json<{ code: string; expiresAt: string }>();
  }

  it('restores once with a new device token, accepting lower case and hyphens', async () => {
    const { app } = await setup();
    const { id, token } = await create(app);
    const c = await code(app, id, token);
    expect(c.code).toMatch(/^[0-9A-Z]{12}$/);
    expect(Date.parse(c.expiresAt) - clock).toBe(24 * 3600 * 1000);
    const typed = `${c.code.slice(0, 4)}-${c.code.slice(4, 8)}-${c.code.slice(8)}`.toLowerCase();
    const r = await app.inject({ method: 'POST', url: '/api/restore', payload: { code: typed } });
    expect(r.statusCode).toBe(200);
    const body = r.json<{ id: string; token: string; payload: unknown; version: number }>();
    expect(body).toMatchObject({ id, payload, version: 1 });
    expect(body.token).not.toBe(token);
    // Both devices' tokens work.
    expect(
      (await app.inject({ method: 'GET', url: `/api/profiles/${id}`, headers: auth(body.token) }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: `/api/profiles/${id}`, headers: auth(token) }))
        .statusCode,
    ).toBe(200);
    // Single use.
    const again = await app.inject({
      method: 'POST',
      url: '/api/restore',
      payload: { code: typed },
    });
    expect(again.statusCode).toBe(404);
  });

  it('expires codes after 24 hours and purges them', async () => {
    const { app, db } = await setup();
    const { id, token } = await create(app);
    const c = await code(app, id, token);
    clock += 24 * 3600 * 1000 + 1;
    expect(
      (await app.inject({ method: 'POST', url: '/api/restore', payload: { code: c.code } }))
        .statusCode,
    ).toBe(404);
    expect(purgeExpiredCodes(db, clock)).toBe(1);
  });

  it('stores codes only as HMAC', async () => {
    const { app, db } = await setup();
    const { id, token } = await create(app);
    const c = await code(app, id, token);
    const rows = db.prepare<[], { hmac: string }>('SELECT hmac FROM restore_codes').all();
    expect(rows[0]?.hmac).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(c.code);
  });

  it('cools a client down after 5 failed redemptions', async () => {
    // The per-minute rate limit runs on real time; lift it so only the cooldown is measured.
    const { app } = await setup({}, undefined, 100);
    const { id, token } = await create(app);
    const good = await code(app, id, token);
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/restore',
        payload: { code: '0000-0000-0000' },
      });
      expect(r.statusCode).toBe(404);
    }
    // A minute later the rate limit has reset, but the cooldown holds even for a good code.
    clock += 61_000;
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/restore',
      payload: { code: good.code },
    });
    expect(blocked.statusCode).toBe(429);
    clock += RESTORE_COOLDOWN_MS;
    const ok = await app.inject({
      method: 'POST',
      url: '/api/restore',
      payload: { code: good.code },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('logs a global alarm when failed redemptions pass the threshold', async () => {
    const { app } = await setup({ RESTORE_ALARM_PER_HOUR: '3' });
    for (let i = 0; i < 4; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/restore',
        payload: { code: '0000-0000-0000' },
        remoteAddress: `10.0.0.${i}`,
      });
    }
    expect(logs).toContain('restore code alarm');
  });
});

describe('limits, retention, logging', () => {
  it('rate limits /api/restore at 5 per minute', async () => {
    const { app } = await setup();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/restore',
        payload: { code: 'not a code' },
        remoteAddress: '10.1.1.1',
      });
      codes.push(r.statusCode);
    }
    expect(codes.at(-1)).toBe(429);
  });

  it('never rate limits the web app files, only the API', async () => {
    const { app } = await setup();
    for (let i = 0; i < 120; i++) {
      const r = await app.inject({
        method: 'GET',
        url: `/assets/chunk-${i}.js`,
        remoteAddress: '10.4.4.4',
      });
      expect(r.statusCode).not.toBe(429);
    }
  });

  it('rate limits the API at 60 per minute per client', async () => {
    const { app } = await setup();
    let last = 0;
    for (let i = 0; i < 61; i++) {
      last = (await app.inject({ method: 'GET', url: '/api/health', remoteAddress: '10.2.2.2' }))
        .statusCode;
    }
    expect(last).toBe(429);
    const other = await app.inject({
      method: 'GET',
      url: '/api/health',
      remoteAddress: '10.3.3.3',
    });
    expect(other.statusCode).toBe(200);
  });

  it('deletes profiles not accessed within the retention period', async () => {
    const { app, db } = await setup();
    const { id, token } = await create(app);
    clock += 539 * 86_400_000;
    expect(purgeStaleProfiles(db, clock, 540)).toBe(0);
    await app.inject({ method: 'GET', url: `/api/profiles/${id}`, headers: auth(token) });
    clock += 541 * 86_400_000;
    expect(purgeStaleProfiles(db, clock, 540)).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM tokens').get()).toEqual({ n: 0 });
  });

  it('accepts feedback up to 2000 characters', async () => {
    const { app } = await setup();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/feedback',
          payload: { message: 'Works well' },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/feedback',
          payload: { message: 'x'.repeat(2001) },
        })
      ).statusCode,
    ).toBe(400);
  });

  it('never logs the Authorization header or IP addresses', async () => {
    const { app } = await setup();
    const { id, token } = await create(app);
    await app.inject({
      method: 'GET',
      url: `/api/profiles/${id}`,
      headers: { ...auth(token), 'user-agent': 'SecretAgent/1.0' },
      remoteAddress: '203.0.113.77',
    });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs).not.toContain(token);
    expect(logs).not.toContain('Bearer');
    expect(logs).not.toContain('203.0.113.77');
    expect(logs).not.toContain('127.0.0.1');
    expect(logs).not.toContain('SecretAgent');
  });

  it('parses TRUST_PROXY forms', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('2')).toBe(2);
    expect(parseTrustProxy('10.0.0.0/8, 192.168.1.1')).toEqual(['10.0.0.0/8', '192.168.1.1']);
  });

  it('apps/web/vercel.json sends the same CSP and security headers as this server', async () => {
    const { app } = await setup();
    const r = await app.inject({ method: 'GET', url: '/api/health' });
    const vercel = JSON.parse(
      await readFile(new URL('../../web/vercel.json', import.meta.url), 'utf8'),
    ) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
    const all = vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? [];
    expect(all.length).toBeGreaterThan(5);
    for (const { key, value } of all) {
      expect(String(r.headers[key.toLowerCase()]), key).toBe(value);
    }
  });

  it('sends a strict CSP', async () => {
    const { app } = await setup();
    const r = await app.inject({ method: 'GET', url: '/api/health' });
    const csp = String(r.headers['content-security-policy']);
    expect(csp).toContain("connect-src 'self' blob:");
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).toContain('worker-src');
    // blob: for the verified video tool only; never inline script.
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval' blob:");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toMatch(/https?:/);
  });
});
