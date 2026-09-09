import type * as SQLite from 'expo-sqlite';

import type {
  CurrentUser,
  UserRepository,
} from '../../features/authentication/application/ports';
import type { UserRole } from '../../types/domain';

interface UserRow {
  id: string;
  name: string;
  role: UserRole;
}

/**
 * Reads the local user record.
 *
 * INTERIM IMPLEMENTATION. With no authentication decided (CLAUDE.md §18) this
 * returns the earliest-created local user, which on a single-user field device
 * is the device's owner. It returns `null` rather than inventing a user when
 * none exists, so the capture screen can say so instead of writing an
 * observation attributed to nobody.
 */
export function createUserRepository(
  db: SQLite.SQLiteDatabase
): UserRepository {
  return {
    async getCurrentUser(): Promise<CurrentUser | null> {
      const row = await db.getFirstAsync<UserRow>(
        `SELECT id, name, role FROM users ORDER BY created_at ASC LIMIT 1`
      );
      return row ?? null;
    },
  };
}
