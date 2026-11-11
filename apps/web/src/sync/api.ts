// Client for the optional Clearly API (apps/server). Same origin: /api. Every response body is
// validated with zod. Network failures become ApiError('offline') so the UI can stay calm.

import { z } from 'zod';

export type ApiErrorKind =
  | 'offline'
  | 'unauthorised'
  | 'not-found'
  | 'conflict'
  | 'rate-limited'
  | 'too-large'
  | 'invalid'
  | 'server';

export class ApiError extends Error {
  override readonly name = 'ApiError';
  constructor(
    readonly kind: ApiErrorKind,
    readonly body?: unknown,
  ) {
    super(kind);
  }
}

/** Version of the consent text the person agreed to (docs/PRIVACY.txt). */
export const CONSENT_VERSION = '2026-11';

const kindFor = (status: number): ApiErrorKind =>
  status === 401
    ? 'unauthorised'
    : status === 404
      ? 'not-found'
      : status === 409
        ? 'conflict'
        : status === 429
          ? 'rate-limited'
          : status === 413
            ? 'too-large'
            : status === 400
              ? 'invalid'
              : 'server';

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

async function call<T>(
  method: string,
  path: string,
  schema: z.ZodType<T> | null,
  body?: unknown,
  token?: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError('offline');
  }
  // A proxy with no server behind it answers 502/503/504: treat as unreachable.
  if (res.status === 502 || res.status === 503 || res.status === 504) throw new ApiError('offline');
  const text = await res.text();
  const json = parseJson(text);
  if (!res.ok) throw new ApiError(kindFor(res.status), json);
  if (!schema) return undefined as T;
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiError('server');
  return parsed.data;
}

const payload = z.record(z.string(), z.unknown());
export const conflictSchema = z.object({
  version: z.number().int(),
  payload,
  updatedAt: z.string(),
});
export type ConflictBody = z.infer<typeof conflictSchema>;

export const api = {
  create: (p: unknown) =>
    call(
      'POST',
      '/profiles',
      z.object({ id: z.string(), token: z.string(), version: z.number().int() }),
      { payload: p, consent: { healthDataBackup: true, version: CONSENT_VERSION } },
    ),
  get: (id: string, token: string) =>
    call('GET', `/profiles/${encodeURIComponent(id)}`, conflictSchema, undefined, token),
  put: (id: string, token: string, p: unknown, baseVersion: number) =>
    call(
      'PUT',
      `/profiles/${encodeURIComponent(id)}`,
      z.object({ version: z.number().int() }),
      { payload: p, baseVersion },
      token,
    ),
  remove: (id: string, token: string) =>
    call('DELETE', `/profiles/${encodeURIComponent(id)}`, null, undefined, token),
  restoreCode: (id: string, token: string) =>
    call(
      'POST',
      `/profiles/${encodeURIComponent(id)}/restore-code`,
      z.object({ code: z.string(), expiresAt: z.string() }),
      undefined,
      token,
    ),
  redeem: (code: string) =>
    call(
      'POST',
      '/restore',
      z.object({ id: z.string(), token: z.string(), payload, version: z.number().int() }),
      { code },
    ),
  rotate: (id: string, token: string) =>
    call(
      'POST',
      `/profiles/${encodeURIComponent(id)}/rotate-token`,
      z.object({ token: z.string() }),
      undefined,
      token,
    ),
  feedback: (message: string, appVersion: string) =>
    call('POST', '/feedback', null, { message, appVersion }),
};
