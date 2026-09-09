/**
 * Schema migration runner.
 *
 * Schema version is tracked with SQLite's built-in `PRAGMA user_version`,
 * an integer stored in the database header. A fresh database reports 0, so
 * a first launch applies every migration in order and an upgrade applies
 * only what is missing (docs/database.md §11).
 *
 * Each migration runs inside its own transaction. SQLite executes DDL
 * transactionally, so a migration that fails halfway leaves the database at
 * its previous version with no partial schema — the app can retry on the
 * next launch instead of starting against a half-created schema.
 */

/**
 * The subset of the database API the migrator needs.
 *
 * Declared structurally rather than importing `expo-sqlite` directly so the
 * migrator can be exercised against any SQLite driver, and so the choice of
 * driver stays an infrastructure detail (CLAUDE.md §5).
 * `SQLiteDatabase` from expo-sqlite satisfies this interface as-is.
 */
export interface MigrationDatabase {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export interface Migration {
  /** Schema version this migration produces. Must be a positive integer. */
  version: number;
  /** Human-readable identifier, used in error messages. */
  name: string;
  /** SQL applied to move the schema to `version`. */
  up: string;
}

export interface MigrationResult {
  previousVersion: number;
  currentVersion: number;
  /** Names of the migrations applied by this call, in order. */
  applied: string[];
}

/** Reads the schema version currently stored in the database. */
export async function getSchemaVersion(db: MigrationDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  return row?.user_version ?? 0;
}

/**
 * Validates the migration list and returns it sorted by version.
 *
 * Rejects duplicate or non-sequential versions: a gap or a repeat means two
 * branches defined a migration with the same number, which would leave
 * devices on different schemas that both report the same `user_version`.
 * Failing loudly at startup is preferable to that going unnoticed.
 */
function assertValidMigrations(migrations: Migration[]): Migration[] {
  const sorted = [...migrations].sort((a, b) => a.version - b.version);

  sorted.forEach((migration, index) => {
    const expected = index + 1;
    if (!Number.isInteger(migration.version) || migration.version < 1) {
      throw new Error(
        `Migration "${migration.name}" has an invalid version: ${migration.version}`
      );
    }
    if (migration.version !== expected) {
      throw new Error(
        `Migration versions must be sequential starting at 1. Expected ` +
          `${expected} but found ${migration.version} ("${migration.name}").`
      );
    }
  });

  return sorted;
}

/**
 * Applies every migration newer than the database's current schema version.
 *
 * Idempotent: calling it on an already-migrated database applies nothing and
 * reports an empty `applied` list.
 */
export async function runMigrations(
  db: MigrationDatabase,
  migrations: Migration[]
): Promise<MigrationResult> {
  const ordered = assertValidMigrations(migrations);
  const previousVersion = await getSchemaVersion(db);

  if (previousVersion > ordered.length) {
    // The database was written by a newer build of the app. Downgrading the
    // schema is not supported and guessing would risk the user's
    // unsynchronized data, so refuse rather than proceed (CLAUDE.md §6).
    throw new Error(
      `Database schema version ${previousVersion} is newer than this build ` +
        `supports (${ordered.length}). Refusing to downgrade.`
    );
  }

  const pending = ordered.filter((m) => m.version > previousVersion);
  const applied: string[] = [];

  for (const migration of pending) {
    try {
      await db.withTransactionAsync(async () => {
        await db.execAsync(migration.up);
        // `PRAGMA user_version` does not accept bound parameters, so the
        // value is interpolated. It is a validated integer from the
        // migration list, never external input.
        await db.execAsync(`PRAGMA user_version = ${migration.version}`);
      });
    } catch (error) {
      throw new Error(
        `Migration ${migration.version} ("${migration.name}") failed: ` +
          `${error instanceof Error ? error.message : String(error)}`
      );
    }
    applied.push(migration.name);
  }

  return {
    previousVersion,
    currentVersion: await getSchemaVersion(db),
    applied,
  };
}
