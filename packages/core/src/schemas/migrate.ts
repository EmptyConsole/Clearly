// Versioned persistence: every stored document carries schemaVersion, and each version has a
// function that moves it one version forward. Reading always migrates to the current version and
// then validates with the current zod schema.

import { z } from 'zod';

export type JsonObject = Record<string, unknown>;

export interface VersionedSchema<T> {
  readonly name: string;
  readonly currentVersion: number;
  readonly schema: z.ZodType<T>;
  /** migrations[v] turns a version-v document into a version-(v+1) document. */
  readonly migrations: Readonly<Record<number, (doc: JsonObject) => JsonObject>>;
  /** Migrates embedded versioned documents (for example a profile's audiogram) at the current version. */
  readonly migrateNested?: (doc: JsonObject) => JsonObject;
}

export class MigrationError extends Error {
  override readonly name = 'MigrationError';
}

const header = z.object({ schemaVersion: z.number().int().min(1) }).loose();

export function migrate<T>(def: VersionedSchema<T>, input: unknown): T {
  const parsed = header.safeParse(input);
  if (!parsed.success) {
    throw new MigrationError(`${def.name}: missing or invalid schemaVersion`);
  }
  let doc: JsonObject = { ...parsed.data };
  let version = parsed.data.schemaVersion;
  if (version > def.currentVersion) {
    throw new MigrationError(
      `${def.name}: version ${version} is newer than this app understands (${def.currentVersion})`,
    );
  }
  while (version < def.currentVersion) {
    const step = def.migrations[version];
    if (!step) throw new MigrationError(`${def.name}: no migration from version ${version}`);
    doc = { ...step(doc), schemaVersion: version + 1 };
    version++;
  }
  if (def.migrateNested) doc = def.migrateNested(doc);
  return def.schema.parse(doc);
}

/** Checks a definition has a migration for every version below the current one. */
export function missingMigrations(def: VersionedSchema<unknown>): number[] {
  const missing: number[] = [];
  for (let v = 1; v < def.currentVersion; v++) if (!def.migrations[v]) missing.push(v);
  return missing;
}
