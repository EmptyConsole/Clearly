// Server configuration from the environment, validated with zod. See .env.example.

import { z } from 'zod';

const base64Key = z
  .string()
  .regex(/^[A-Za-z0-9+/]{43}=$/, 'must be 32 bytes, base64 encoded (44 characters)');

/** TRUST_PROXY: off (default), a hop count, or a comma-separated list of addresses/CIDRs. */
export type TrustProxy = false | number | string[];

export function parseTrustProxy(raw: string | undefined): TrustProxy {
  const v = (raw ?? '').trim();
  if (v === '' || v === 'false' || v === '0' || v === 'off') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_PATH: z.string().min(1).default('data/clearly.sqlite'),
  ALLOWED_ORIGINS: z.string().default(''),
  PUBLIC_URL: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.string().optional(),
  RESTORE_CODE_PEPPER: z.string().min(32, 'must be at least 32 characters'),
  /** Current key: "<keyId>:<base64 32 bytes>". */
  PAYLOAD_ENCRYPTION_KEY: z.string().min(1),
  /** Older keys still readable during rotation, comma separated, same format. */
  PAYLOAD_ENCRYPTION_KEYS_OLD: z.string().default(''),
  PROFILE_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(540),
  /** Built web app to serve (production). Empty: API only. */
  WEB_DIST: z.string().default(''),
  /** Failed restore redemptions per hour, across all clients, that raise the global alarm. */
  RESTORE_ALARM_PER_HOUR: z.coerce.number().int().min(1).default(200),
});

export interface EncryptionKey {
  readonly id: string;
  readonly key: Buffer;
}

export interface Config {
  readonly port: number;
  readonly host: string;
  readonly databasePath: string;
  readonly allowedOrigins: readonly string[];
  readonly publicUrl: string;
  readonly trustProxy: TrustProxy;
  readonly restoreCodePepper: string;
  readonly currentKey: EncryptionKey;
  readonly oldKeys: readonly EncryptionKey[];
  readonly retentionDays: number;
  readonly webDist: string;
  readonly restoreAlarmPerHour: number;
}

function parseKey(raw: string): EncryptionKey {
  const i = raw.indexOf(':');
  if (i < 1) throw new Error('encryption keys are written "<keyId>:<base64 key>"');
  const id = raw.slice(0, i);
  const b64 = base64Key.parse(raw.slice(i + 1));
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error('key ids are 1 to 32 letters or digits');
  return { id, key: Buffer.from(b64, 'base64') };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = schema.parse(env);
  return {
    port: e.PORT,
    host: e.HOST,
    databasePath: e.DATABASE_PATH,
    allowedOrigins: e.ALLOWED_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    publicUrl: e.PUBLIC_URL,
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    restoreCodePepper: e.RESTORE_CODE_PEPPER,
    currentKey: parseKey(e.PAYLOAD_ENCRYPTION_KEY),
    oldKeys: e.PAYLOAD_ENCRYPTION_KEYS_OLD.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(parseKey),
    retentionDays: e.PROFILE_RETENTION_DAYS,
    webDist: e.WEB_DIST,
    restoreAlarmPerHour: e.RESTORE_ALARM_PER_HOUR,
  };
}
