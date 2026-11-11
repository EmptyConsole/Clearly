import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FIXTURES } from './fixtures.ts';
import {
  AUDIOGRAM,
  CALIBRATION,
  PROFILE,
  SETTINGS,
  VERSIONED_SCHEMAS,
  MigrationError,
  migrate,
  missingMigrations,
} from './index.ts';
import type { VersionedSchema } from './migrate.ts';

describe('migration harness: every version of every schema migrates to the current one', () => {
  for (const def of VERSIONED_SCHEMAS as readonly VersionedSchema<unknown>[]) {
    describe(def.name, () => {
      it('has a migration for every older version', () => {
        expect(missingMigrations(def)).toEqual([]);
      });
      for (let v = 1; v <= def.currentVersion; v++) {
        it(`has a fixture for version ${v} that migrates and validates`, () => {
          const fixture = FIXTURES[def.name]?.[v];
          expect(fixture, `add a v${v} fixture for ${def.name} in fixtures.ts`).toBeDefined();
          const out = migrate(def, fixture) as { schemaVersion: number };
          expect(out.schemaVersion).toBe(def.currentVersion);
        });
      }
      it('rejects a version newer than this app', () => {
        const fixture = FIXTURES[def.name]?.[def.currentVersion] as Record<string, unknown>;
        expect(() => migrate(def, { ...fixture, schemaVersion: def.currentVersion + 1 })).toThrow(
          MigrationError,
        );
      });
      it('rejects a document without schemaVersion', () => {
        expect(() => migrate(def, { hello: 1 })).toThrow(MigrationError);
      });
    });
  }
});

describe('migration engine', () => {
  // A test-only schema with three versions, to exercise multi-step migration.
  const v3 = z.object({ schemaVersion: z.literal(3), fullName: z.string(), level: z.number() });
  const def: VersionedSchema<z.infer<typeof v3>> = {
    name: 'Example',
    currentVersion: 3,
    schema: v3,
    migrations: {
      1: (d) => ({ ...d, level: 0 }),
      2: (d) => {
        const { name, ...rest } = d;
        return { ...rest, fullName: String(name) };
      },
    },
  };
  it('applies each step in order', () => {
    expect(migrate(def, { schemaVersion: 1, name: 'A' })).toEqual({
      schemaVersion: 3,
      fullName: 'A',
      level: 0,
    });
    expect(migrate(def, { schemaVersion: 2, name: 'B', level: 4 })).toEqual({
      schemaVersion: 3,
      fullName: 'B',
      level: 4,
    });
  });
  it('reports a missing step', () => {
    const step1 = def.migrations[1];
    if (!step1) throw new Error('fixture setup');
    const broken = { ...def, migrations: { 1: step1 } };
    expect(missingMigrations(broken)).toEqual([2]);
    expect(() => migrate(broken, { schemaVersion: 1, name: 'A' })).toThrow(MigrationError);
  });
});

describe('schema details', () => {
  it('fills profile defaults, including zero headphone compensation', () => {
    const p = migrate(PROFILE, FIXTURES['Profile']?.[1]);
    expect(p.boostStyle).toBe('standard');
    expect(p.capDb).toBe(18);
    expect(p.strength).toBe(1);
    expect(p.settingsOverrides).toEqual({});
    expect(p.headphoneCompensation.left).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(p.ringingPitchHz).toBeUndefined();
  });

  it('rejects calibration above -12 dBFS', () => {
    const c = FIXTURES['Calibration']?.[1] as Record<string, unknown>;
    expect(() => migrate(CALIBRATION, { ...c, lcDbfs: -6 })).toThrow();
  });

  it('requires null reliability exactly for starter audiograms', () => {
    const a = FIXTURES['Audiogram']?.[1] as Record<string, unknown>;
    expect(() => migrate(AUDIOGRAM, { ...a, reliability: null })).toThrow();
    expect(() => migrate(AUDIOGRAM, { ...a, method: 'starter' })).toThrow();
  });

  it('requires eight bands', () => {
    const a = FIXTURES['Audiogram']?.[1] as { ears: { left: Record<string, unknown> } } & Record<
      string,
      unknown
    >;
    const bad = { ...a, ears: { ...a.ears, left: { ...a.ears.left, lossDb: [0, 0, 0] } } };
    expect(() => migrate(AUDIOGRAM, bad)).toThrow();
  });

  it('fills settings defaults', () => {
    expect(migrate(SETTINGS, { schemaVersion: 1 })).toEqual({
      schemaVersion: 1,
      activeProfileId: null,
      preset: 'movie',
      ambientBoostDb: 0,
      loudestLimitDbfs: -12,
      pace: 'auto',
    });
  });
});
