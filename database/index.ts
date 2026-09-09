/**
 * Public surface of the local database module.
 *
 * Everything above this layer (features, services, UI) goes through
 * repositories built on `openDatabase`. Presentation components must not
 * import this module directly or issue SQL of their own (CLAUDE.md §5).
 */
export {
  DATABASE_NAME,
  openDatabase,
  migrateDatabase,
  closeDatabase,
} from './connection';

export {
  getSchemaVersion,
  runMigrations,
  type Migration,
  type MigrationDatabase,
  type MigrationResult,
} from './migrator';

export { migrations } from './migrations';
