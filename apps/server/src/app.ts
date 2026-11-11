// The Clearly API (Fastify 5). Optional: the app works fully without it. Every body is validated
// with zod. Health data rules: see db.ts and docs/PRIVACY.txt.

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { normaliseRestoreCode, RESTORE_CODE_TTL_MS } from '@clearly/core';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Writable } from 'node:stream';
import { z } from 'zod';
import type { Config } from './config.ts';
import { hmacCode, newId, newRestoreCode, newToken, open, seal, sha256 } from './crypto.ts';
import type { Db } from './db.ts';

/** Profile payloads are capped at 256 KB of JSON. */
export const MAX_PAYLOAD_BYTES = 256 * 1024;
export const RATE_LIMIT_PER_MINUTE = 60;
export const RESTORE_RATE_LIMIT_PER_MINUTE = 5;
export const RESTORE_FAILS_BEFORE_COOLDOWN = 5;
export const RESTORE_COOLDOWN_MS = 15 * 60 * 1000;
export const FEEDBACK_MAX_CHARS = 2000;

export interface AppOptions {
  readonly config: Config;
  readonly db: Db;
  readonly now?: () => number;
  /** Where logs go (tests capture them). Defaults to stdout. */
  readonly logStream?: Writable;
  readonly logLevel?: string;
  /** Tests only: the per-minute limit on /api/restore (default 5). */
  readonly restoreRateLimit?: number;
}

const payloadSchema = z.record(z.string(), z.unknown());
const consentSchema = z.object({
  healthDataBackup: z.literal(true),
  version: z.string().min(1).max(32),
});
const idParams = z.object({ id: z.string().min(1).max(64) });

interface ProfileRow {
  id: string;
  key_id: string;
  payload: Buffer;
  version: number;
  updated_at: number;
}

export async function buildApp(o: AppOptions): Promise<FastifyInstance> {
  const { config, db } = o;
  const now = o.now ?? Date.now;
  const keys = [config.currentKey, ...config.oldKeys];

  // Fastify's types omit the hop-count form that proxy-addr accepts; a number is valid at run time.
  const trustProxy = config.trustProxy as boolean | string[];
  const app = Fastify({
    trustProxy,
    bodyLimit: MAX_PAYLOAD_BYTES + 16 * 1024,
    logger: {
      level: o.logLevel ?? 'info',
      ...(o.logStream ? { stream: o.logStream } : {}),
      // Never log IP addresses, headers (Authorization), user agents or bodies.
      serializers: {
        req: (req: { method: string; routeOptions?: { url?: string | undefined } }) => ({
          method: req.method,
          route: req.routeOptions?.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      redact: {
        paths: ['req.headers', 'req.remoteAddress', 'req.ip', 'headers', 'authorization'],
        censor: '[redacted]',
      },
    },
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((err, _req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send({ error: 'invalid_request' });
    }
    const e = err as { statusCode?: number; message?: string };
    const status = e.statusCode ?? 500;
    if (status >= 500) app.log.error({ err: { message: e.message } }, 'server error');
    return reply.code(status).send({ error: status === 413 ? 'too_large' : 'error' });
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        // blob: for the video tool (M11): its core is downloaded, checked against its SHA-256,
        // kept in the Cache API and imported from a blob URL in a worker. Only script already
        // running on this origin can create a blob URL.
        scriptSrc: ["'self'", "'wasm-unsafe-eval'", 'blob:'],
        workerSrc: ["'self'", 'blob:'],
        // blob: so the video tool's worker can fetch its own verified wasm from a blob URL.
        connectSrc: ["'self'", 'blob:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:', 'data:'],
        fontSrc: ["'self'", 'data:'],
        styleSrc: ["'self'"],
        styleSrcAttr: ["'unsafe-inline'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        manifestSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, {
    origin: (origin, cb) => {
      // Same-origin requests and tools send no Origin header.
      if (!origin || config.allowedOrigins.includes(origin)) cb(null, true);
      else cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  // Client addresses are used only in memory, here, for limits.
  await app.register(rateLimit, {
    max: RATE_LIMIT_PER_MINUTE,
    timeWindow: 60_000,
    // Only the API is limited. The built web app loads a hundred or so files (route chunks, the
    // service worker's precache), which a 60-per-minute limit would block (found in M10).
    allowList: (req) => !req.url.startsWith('/api/'),
    errorResponseBuilder: () => ({ statusCode: 429, error: 'rate_limited' }),
  });

  // ---- helpers --------------------------------------------------------------------------------

  const getRow = db.prepare<[string], ProfileRow>(
    'SELECT id, key_id, payload, version, updated_at FROM profiles WHERE id = ?',
  );
  const tokenOk = db.prepare<[string, string], { n: number }>(
    'SELECT 1 AS n FROM tokens WHERE hash = ? AND profile_id = ?',
  );
  const touch = db.prepare<[number, string]>('UPDATE profiles SET accessed_at = ? WHERE id = ?');
  const insertToken = db.prepare<[string, string, number]>(
    'INSERT INTO tokens (hash, profile_id, created_at) VALUES (?, ?, ?)',
  );

  function bearer(req: { headers: { authorization?: string | undefined } }): string | null {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return null;
    const t = h.slice(7).trim();
    return /^[A-Za-z0-9_-]{43}$/.test(t) ? t : null;
  }

  /** Authorises a request for a profile: 401 for a missing or wrong token, 404 for no profile. */
  function authorise(
    req: { headers: { authorization?: string | undefined } },
    reply: FastifyReply,
    id: string,
  ): ProfileRow | null {
    const token = bearer(req);
    if (!token) {
      void reply.code(401).send({ error: 'unauthorised' });
      return null;
    }
    const row = getRow.get(id);
    if (!row) {
      void reply.code(404).send({ error: 'not_found' });
      return null;
    }
    if (!tokenOk.get(sha256(token), id)) {
      void reply.code(401).send({ error: 'unauthorised' });
      return null;
    }
    touch.run(now(), id);
    return row;
  }

  function encode(payload: unknown): { sealedBlob: Buffer; keyId: string } | 'too_large' {
    const json = JSON.stringify(payload);
    if (Buffer.byteLength(json, 'utf8') > MAX_PAYLOAD_BYTES) return 'too_large';
    const s = seal(json, config.currentKey);
    return { sealedBlob: s.blob, keyId: s.keyId };
  }

  const decode = (row: ProfileRow): unknown =>
    JSON.parse(open({ keyId: row.key_id, blob: row.payload }, keys));

  // ---- restore-code abuse controls (in memory only) ------------------------------------------

  const fails = new Map<string, { count: number; until: number }>();
  let alarmWindowStart = now();
  let alarmCount = 0;
  let alarmRaised = false;
  function recordFail(ip: string): void {
    const f = fails.get(ip) ?? { count: 0, until: 0 };
    f.count += 1;
    if (f.count >= RESTORE_FAILS_BEFORE_COOLDOWN) {
      f.until = now() + RESTORE_COOLDOWN_MS;
      f.count = 0;
    }
    fails.set(ip, f);
    if (now() - alarmWindowStart > 3_600_000) {
      alarmWindowStart = now();
      alarmCount = 0;
      alarmRaised = false;
    }
    alarmCount += 1;
    if (alarmCount > config.restoreAlarmPerHour && !alarmRaised) {
      alarmRaised = true;
      app.log.warn(
        { failedRedemptionsThisHour: alarmCount },
        'restore code alarm: many failed redemptions',
      );
    }
  }
  const inCooldown = (ip: string): boolean => (fails.get(ip)?.until ?? 0) > now();

  // ---- routes -----------------------------------------------------------------------------------

  app.get('/api/health', () => ({ ok: true, retentionDays: config.retentionDays }));

  app.post(
    '/api/profiles',
    { schema: { body: z.object({ payload: payloadSchema, consent: consentSchema }) } },
    (req, reply) => {
      const enc = encode(req.body.payload);
      if (enc === 'too_large') return reply.code(413).send({ error: 'too_large' });
      const id = newId();
      const token = newToken();
      const t = now();
      db.transaction(() => {
        db.prepare(
          `INSERT INTO profiles (id, key_id, payload, version, consent_version, created_at, updated_at, accessed_at)
           VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
        ).run(id, enc.keyId, enc.sealedBlob, req.body.consent.version, t, t, t);
        insertToken.run(sha256(token), id, t);
      })();
      return reply.code(201).send({ id, token, version: 1 });
    },
  );

  app.get('/api/profiles/:id', { schema: { params: idParams } }, (req, reply) => {
    const row = authorise(req, reply, req.params.id);
    if (!row) return reply;
    return {
      payload: decode(row),
      version: row.version,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  });

  app.put(
    '/api/profiles/:id',
    {
      schema: {
        params: idParams,
        body: z.object({ payload: payloadSchema, baseVersion: z.number().int().min(1) }),
      },
    },
    (req, reply) => {
      const row = authorise(req, reply, req.params.id);
      if (!row) return reply;
      if (req.body.baseVersion !== row.version) {
        return reply.code(409).send({
          version: row.version,
          payload: decode(row),
          updatedAt: new Date(row.updated_at).toISOString(),
        });
      }
      const enc = encode(req.body.payload);
      if (enc === 'too_large') return reply.code(413).send({ error: 'too_large' });
      const version = row.version + 1;
      db.prepare(
        'UPDATE profiles SET payload = ?, key_id = ?, version = ?, updated_at = ? WHERE id = ? AND version = ?',
      ).run(enc.sealedBlob, enc.keyId, version, now(), row.id, row.version);
      return { version };
    },
  );

  app.delete('/api/profiles/:id', { schema: { params: idParams } }, (req, reply) => {
    const row = authorise(req, reply, req.params.id);
    if (!row) return reply;
    // Tokens and restore codes go with it (ON DELETE CASCADE).
    db.prepare('DELETE FROM profiles WHERE id = ?').run(row.id);
    return reply.code(204).send();
  });

  app.post('/api/profiles/:id/restore-code', { schema: { params: idParams } }, (req, reply) => {
    const row = authorise(req, reply, req.params.id);
    if (!row) return reply;
    const code = newRestoreCode();
    const expiresAt = now() + RESTORE_CODE_TTL_MS;
    db.prepare('INSERT INTO restore_codes (hmac, profile_id, expires_at) VALUES (?, ?, ?)').run(
      hmacCode(code, config.restoreCodePepper),
      row.id,
      expiresAt,
    );
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  });

  app.post(
    '/api/restore',
    {
      schema: { body: z.object({ code: z.string().min(1).max(40) }) },
      config: {
        rateLimit: {
          max: o.restoreRateLimit ?? RESTORE_RATE_LIMIT_PER_MINUTE,
          timeWindow: 60_000,
        },
      },
    },
    (req, reply) => {
      if (inCooldown(req.ip)) return reply.code(429).send({ error: 'cooldown' });
      const code = normaliseRestoreCode(req.body.code);
      const hmac = code ? hmacCode(code, config.restoreCodePepper) : null;
      const found = hmac
        ? db
            .prepare<[string, number], { profile_id: string }>(
              'SELECT profile_id FROM restore_codes WHERE hmac = ? AND expires_at > ?',
            )
            .get(hmac, now())
        : undefined;
      if (!hmac || !found) {
        recordFail(req.ip);
        return reply.code(404).send({ error: 'invalid_code' });
      }
      const row = getRow.get(found.profile_id);
      if (!row) {
        recordFail(req.ip);
        return reply.code(404).send({ error: 'invalid_code' });
      }
      const token = newToken();
      db.transaction(() => {
        // One use: the code is deleted as it is redeemed.
        db.prepare('DELETE FROM restore_codes WHERE hmac = ?').run(hmac);
        insertToken.run(sha256(token), row.id, now());
        touch.run(now(), row.id);
      })();
      return { id: row.id, token, payload: decode(row), version: row.version };
    },
  );

  app.post('/api/profiles/:id/rotate-token', { schema: { params: idParams } }, (req, reply) => {
    const row = authorise(req, reply, req.params.id);
    if (!row) return reply;
    const token = newToken();
    db.transaction(() => {
      db.prepare('DELETE FROM tokens WHERE profile_id = ?').run(row.id);
      insertToken.run(sha256(token), row.id, now());
    })();
    return { token };
  });

  app.post(
    '/api/feedback',
    {
      schema: {
        body: z.object({
          message: z.string().trim().min(1).max(FEEDBACK_MAX_CHARS),
          appVersion: z.string().max(40).optional(),
        }),
      },
    },
    (req, reply) => {
      db.prepare('INSERT INTO feedback (message, app_version, created_at) VALUES (?, ?, ?)').run(
        req.body.message,
        req.body.appVersion ?? null,
        now(),
      );
      return reply.code(204).send();
    },
  );

  // ---- the built web app (production) -----------------------------------------------------------

  if (config.webDist && existsSync(join(config.webDist, 'index.html'))) {
    const root = resolve(config.webDist);
    await app.register(fastifyStatic, {
      root,
      wildcard: false,
      setHeaders: (res, path) => {
        const rel = path.slice(root.length);
        if (rel.startsWith('/assets/') || rel.startsWith('/heavy/')) {
          void res.header('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          void res.header('Cache-Control', 'no-cache');
        }
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
      }
      return reply.code(404).send({ error: 'not_found' });
    });
  }

  return app;
}

// ---- scheduled jobs -------------------------------------------------------------------------------

export function purgeExpiredCodes(db: Db, now: number): number {
  return db.prepare('DELETE FROM restore_codes WHERE expires_at <= ?').run(now).changes;
}

/** Deletes profiles not accessed for `days` days (their tokens and codes cascade). */
export function purgeStaleProfiles(db: Db, now: number, days: number): number {
  return db.prepare('DELETE FROM profiles WHERE accessed_at < ?').run(now - days * 86_400_000)
    .changes;
}
