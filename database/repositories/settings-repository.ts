import type * as SQLite from 'expo-sqlite';

import type { DeviceIdentityRepository } from '../../features/synchronization/application/ports';

/**
 * Device identity, backed by `local_settings` (migration 002).
 *
 * The device id is created once and never changes, because replay detection on
 * the server is keyed on it (docs/offline-sync.md §7). It identifies an
 * installation to the sync server; it is not a credential and is not secret,
 * which is why it can live in an unencrypted table (CLAUDE.md §15).
 */
export const DEVICE_ID_KEY = 'sync.device_id';

export function createSettingsRepository(
  db: SQLite.SQLiteDatabase,
  newId: () => string
): DeviceIdentityRepository {
  return {
    async getOrCreateDeviceId(at: string): Promise<string> {
      const existing = await db.getFirstAsync<{ value: string }>(
        `SELECT value FROM local_settings WHERE key = ?`,
        [DEVICE_ID_KEY]
      );
      if (existing?.value) return existing.value;

      const deviceId = newId();

      // INSERT ... ON CONFLICT DO NOTHING, then read back. Two callers racing
      // on first launch must end up with the same id: whichever insert loses
      // reads the winner's value rather than overwriting it, which would
      // change the device's identity after changes had already been uploaded
      // under the old one.
      await db.runAsync(
        `INSERT INTO local_settings (key, value, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (key) DO NOTHING`,
        [DEVICE_ID_KEY, deviceId, at, at]
      );

      const stored = await db.getFirstAsync<{ value: string }>(
        `SELECT value FROM local_settings WHERE key = ?`,
        [DEVICE_ID_KEY]
      );
      return stored?.value ?? deviceId;
    },
  };
}
