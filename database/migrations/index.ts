import type { Migration } from '../migrator';
import { migration001 } from './001-initial-schema';

/**
 * Every migration, in the order they were introduced.
 *
 * Append only. A migration that has shipped must never be edited: devices
 * that already applied it will not re-run it, so an edit produces two
 * different schemas both reporting the same `user_version`. Change the
 * schema by adding a new migration instead.
 */
export const migrations: Migration[] = [migration001];

export { migration001 };
