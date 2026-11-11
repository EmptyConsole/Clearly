// The `clearly` IndexedDB database (Dexie). Rows are stored exactly as their zod schema's
// documents (with schemaVersion); every read goes through `migrate` from @clearly/core, which
// moves old versions forward and validates.

import Dexie, { type Table } from 'dexie';

/** Raw rows: whatever is on disk, unvalidated until read through a repository. */
export interface Row {
  readonly id: string;
  readonly [key: string]: unknown;
}

export interface KvRow {
  readonly key: string;
  readonly value: unknown;
}

export class ClearlyDb extends Dexie {
  profiles!: Table<Row, string>;
  hearingChecks!: Table<Row, string>;
  kv!: Table<KvRow, string>;
  checkProgress!: Table<Row, string>;
  sinChecks!: Table<Row, string>;
  exposureDays!: Table<Row, string>;
  captionCache!: Table<Row, string>;

  constructor(name = 'clearly') {
    super(name);
    // Dexie schema version 1 (M03). Only indexed fields are listed.
    this.version(1).stores({
      profiles: 'id',
      hearingChecks: 'id, profileId, createdAt',
      kv: 'key',
      checkProgress: 'id, expiresAt',
    });
    // Version 2 (M04): the remaining tables. Dexie keeps version 1's tables; rows need no change.
    this.version(2).stores({
      sinChecks: 'id, createdAt',
      exposureDays: 'id',
      captionCache: 'id, createdAt',
    });
  }
}

let shared: ClearlyDb | null = null;

export function getDb(): ClearlyDb {
  shared ??= new ClearlyDb();
  return shared;
}

/** Tests: use a fresh database. */
export function setDbForTests(db: ClearlyDb | null): void {
  shared = db;
}
