import type { Migration } from '../migrator';
import { migration001 } from './001-initial-schema';
import { migration003 } from './003-conversation-drafts';
import { migration002 } from './002-local-settings';

/**
 * Every migration, in the order they were introduced.
 *
 * Append only. A migration that has shipped must never be edited: devices
 * that already applied it will not re-run it, so an edit produces two
 * different schemas both reporting the same `user_version`. Change the
 * schema by adding a new migration instead.
 */
export const migrations: Migration[] = [migration001, migration002, migration003];

export { migration001, migration002 };
