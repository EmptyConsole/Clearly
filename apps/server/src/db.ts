// SQLite (better-sqlite3) in WAL mode with versioned SQL migrations. Stores only: encrypted profile
// JSON, token and code hashes, timestamps, consent version and feedback text. No audio, no IP
// addresses, no user agents.

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Db = Database.Database;

/** Migration n moves the schema from version n-1 to n. Never edit a shipped migration. */
export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE profiles (
     id TEXT PRIMARY KEY,
     key_id TEXT NOT NULL,
     payload BLOB NOT NULL,
     version INTEGER NOT NULL,
     consent_version TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     accessed_at INTEGER NOT NULL
   );
   CREATE TABLE tokens (
     hash TEXT PRIMARY KEY,
     profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX tokens_profile ON tokens(profile_id);
   CREATE TABLE restore_codes (
     hmac TEXT PRIMARY KEY,
     profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
     expires_at INTEGER NOT NULL
   );
   CREATE INDEX restore_codes_profile ON restore_codes(profile_id);
   CREATE TABLE feedback (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     message TEXT NOT NULL,
     app_version TEXT,
     created_at INTEGER NOT NULL
   );`,
];

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    const sql = MIGRATIONS[v];
    if (sql === undefined) break;
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
