import * as SQLite from 'expo-sqlite';

import { migrations } from './migrations';
import { runMigrations, type MigrationResult } from './migrator';

export const DATABASE_NAME = 'hospital-equipment-intelligence.db';

let database: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Applies the connection-level pragmas the schema depends on.
 *
 * Must run outside a transaction: `PRAGMA foreign_keys` is a no-op while one
 * is open, which would silently leave foreign keys unenforced.
 *
 * - `foreign_keys = ON` is required — SQLite defaults it to OFF per
 *   connection, so the FK constraints declared in the migrations do nothing
 *   without it (docs/database.md §14).
 * - `journal_mode = WAL` lets a dashboard read while a capture writes,
 *   instead of the reader blocking on the writer's lock.
 */
async function applyPragmas(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('PRAGMA foreign_keys = ON');
}

/**
 * Opens the local database, applies pragmas, and migrates it to the current
 * schema version.
 *
 * Safe to call from several places at once: concurrent callers await the same
 * open, so migrations never run twice in parallel against one file.
 */
export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;
  if (opening) return opening;

  opening = (async () => {
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await applyPragmas(db);
    await runMigrations(db, migrations);
    database = db;
    return db;
  })();

  try {
    return await opening;
  } finally {
    opening = null;
  }
}

/**
 * Runs migrations against an already-open database.
 *
 * Exposed for tests and for drivers opened elsewhere; normal application code
 * calls `openDatabase`, which migrates on its own.
 */
export async function migrateDatabase(
  db: SQLite.SQLiteDatabase
): Promise<MigrationResult> {
  return runMigrations(db, migrations);
}

/**
 * Closes the connection and clears the cached handle.
 *
 * Intended for tests and for teardown. Application code should keep the
 * single connection open for the lifetime of the process.
 */
export async function closeDatabase(): Promise<void> {
  if (!database) return;
  await database.closeAsync();
  database = null;
}
