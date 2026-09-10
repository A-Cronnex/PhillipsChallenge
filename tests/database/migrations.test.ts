import { migrations } from '../../database/migrations';
import {
  getSchemaVersion,
  runMigrations,
  type Migration,
  type MigrationDatabase,
} from '../../database/migrator';

/**
 * Migrator tests.
 *
 * These exercise the runner against an in-memory fake driver rather than
 * expo-sqlite. expo-sqlite has no Node implementation — it binds to native
 * SQLite — so anything that opens a real database has to run on a device or
 * emulator. Keeping the migrator behind the `MigrationDatabase` interface is
 * what makes this half testable in ordinary CI.
 *
 * The SQL itself (CHECK constraints, foreign keys, uniqueness) is NOT covered
 * here; it needs a real SQLite engine. See `docs/database.md` §17 for what is
 * still outstanding.
 */

interface FakeDb extends MigrationDatabase {
  executed: string[];
  version: number;
  failOnVersion?: number;
}

function createFakeDb(initialVersion = 0): FakeDb {
  const db: FakeDb = {
    executed: [],
    version: initialVersion,

    async execAsync(source: string) {
      const pragma = source.match(/^\s*PRAGMA user_version = (\d+)\s*$/);
      if (pragma) {
        db.version = Number(pragma[1]);
        return;
      }
      if (db.failOnVersion !== undefined && db.version + 1 === db.failOnVersion) {
        throw new Error('simulated SQL failure');
      }
      db.executed.push(source);
    },

    async getFirstAsync<T>(source: string): Promise<T | null> {
      if (/PRAGMA user_version/.test(source)) {
        return { user_version: db.version } as unknown as T;
      }
      return null;
    },

    async withTransactionAsync(task: () => Promise<void>) {
      const snapshotVersion = db.version;
      const snapshotExecuted = [...db.executed];
      try {
        await task();
      } catch (error) {
        // Mirrors SQLite's transactional DDL: a failed migration rolls back
        // completely, leaving the previous schema version intact.
        db.version = snapshotVersion;
        db.executed = snapshotExecuted;
        throw error;
      }
    },
  };
  return db;
}

const noopMigration = (version: number): Migration => ({
  version,
  name: `migration-${version}`,
  up: `CREATE TABLE t${version} (id TEXT PRIMARY KEY);`,
});

describe('runMigrations', () => {
  it('migrates a fresh database from version 0 to the latest version', async () => {
    const db = createFakeDb(0);
    const result = await runMigrations(db, [noopMigration(1), noopMigration(2)]);

    expect(result.previousVersion).toBe(0);
    expect(result.currentVersion).toBe(2);
    expect(result.applied).toEqual(['migration-1', 'migration-2']);
  });

  it('is idempotent: a second run applies nothing', async () => {
    const db = createFakeDb(0);
    const list = [noopMigration(1), noopMigration(2)];

    await runMigrations(db, list);
    const second = await runMigrations(db, list);

    expect(second.applied).toEqual([]);
    expect(second.previousVersion).toBe(2);
    expect(second.currentVersion).toBe(2);
  });

  it('applies only migrations newer than the stored version', async () => {
    const db = createFakeDb(1);
    const result = await runMigrations(db, [noopMigration(1), noopMigration(2)]);

    expect(result.applied).toEqual(['migration-2']);
  });

  it('applies migrations in version order regardless of array order', async () => {
    const db = createFakeDb(0);
    const result = await runMigrations(db, [noopMigration(2), noopMigration(1)]);

    expect(result.applied).toEqual(['migration-1', 'migration-2']);
  });

  it('leaves the schema version unchanged when a migration fails', async () => {
    const db = createFakeDb(0);
    db.failOnVersion = 2;

    await expect(
      runMigrations(db, [noopMigration(1), noopMigration(2)])
    ).rejects.toThrow(/Migration 2 .* failed/);

    // Migration 1 committed; migration 2 rolled back. The device is left on a
    // known version and can retry on next launch.
    expect(await getSchemaVersion(db)).toBe(1);
  });

  it('refuses to run against a database written by a newer build', async () => {
    const db = createFakeDb(5);

    await expect(runMigrations(db, [noopMigration(1)])).rejects.toThrow(
      /Refusing to downgrade/
    );
  });

  it('rejects non-sequential migration versions', async () => {
    const db = createFakeDb(0);

    await expect(
      runMigrations(db, [noopMigration(1), noopMigration(3)])
    ).rejects.toThrow(/sequential/);
  });

  it('rejects duplicate migration versions', async () => {
    const db = createFakeDb(0);

    await expect(
      runMigrations(db, [noopMigration(1), noopMigration(1)])
    ).rejects.toThrow(/sequential/);
  });
});

describe('migration registry', () => {
  it('is sequential and starts at 1', async () => {
    const db = createFakeDb(0);
    const result = await runMigrations(db, migrations);

    expect(result.currentVersion).toBe(migrations.length);
  });

  it('declares unique migration names', () => {
    const names = migrations.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps local-settings as migration 2, appended after the initial schema', () => {
    // The registry is append-only: an already-shipped migration must never be
    // edited or reordered, or devices that applied it will report the same
    // `user_version` for two different schemas. Migration 2 adds the
    // `local_settings` table that holds the sync device id
    // (database/migrations/002-local-settings.ts).
    expect(migrations[0]).toMatchObject({ version: 1, name: 'initial-schema' });
    expect(migrations[1]).toMatchObject({ version: 2, name: 'local-settings' });
  });
});
