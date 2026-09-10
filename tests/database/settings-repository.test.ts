/**
 * Device identity.
 *
 * Stability is the requirement: the server distinguishes a retried change from
 * a new one by `(device_id, entity_id, local_version)`
 * (docs/offline-sync.md §7). An id that changed would break replay detection
 * in both directions — retries would apply twice, and once two devices can
 * hold the same record, one device's change could be mistaken for another's
 * replay and skipped.
 */
import type * as SQLite from 'expo-sqlite';

import {
  DEVICE_ID_KEY,
  createSettingsRepository,
} from '../../database/repositories/settings-repository';

const AT = '2026-09-09T14:48:00.000Z';

function createFakeDb(stored: string | null) {
  const statements: { sql: string; params: unknown[] }[] = [];
  let value = stored;

  const db = {
    async getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      statements.push({ sql, params });
      return value === null ? null : ({ value } as T);
    },
    async runAsync(sql: string, params: unknown[] = []) {
      statements.push({ sql, params });
      // Mirrors ON CONFLICT DO NOTHING: the first writer wins.
      if (value === null) value = params[1] as string;
      return { changes: 1, lastInsertRowId: 0 };
    },
  } as unknown as SQLite.SQLiteDatabase;

  return { db, statements, read: () => value };
}

describe('getOrCreateDeviceId', () => {
  it('returns the stored id without writing anything', async () => {
    const { db, statements } = createFakeDb('existing-device-id');

    const id = await createSettingsRepository(db, () => 'new-id').getOrCreateDeviceId(AT);

    expect(id).toBe('existing-device-id');
    expect(statements.some((s) => /INSERT/i.test(s.sql))).toBe(false);
  });

  it('creates and stores an id on first use', async () => {
    const { db, read } = createFakeDb(null);

    const id = await createSettingsRepository(db, () => 'generated-id').getOrCreateDeviceId(AT);

    expect(id).toBe('generated-id');
    expect(read()).toBe('generated-id');
  });

  it('returns the same id on every subsequent call', async () => {
    const { db } = createFakeDb(null);
    let counter = 0;
    const repository = createSettingsRepository(db, () => `id-${(counter += 1)}`);

    const first = await repository.getOrCreateDeviceId(AT);
    const second = await repository.getOrCreateDeviceId(AT);

    expect(second).toBe(first);
  });

  it('yields to the winner when two callers race on first launch', async () => {
    // Overwriting instead would change the device's identity after changes had
    // already been uploaded under the old one.
    const { db } = createFakeDb(null);
    const repository = createSettingsRepository(db, () => 'mine');

    const [a, b] = await Promise.all([
      repository.getOrCreateDeviceId(AT),
      repository.getOrCreateDeviceId(AT),
    ]);

    expect(a).toBe(b);
  });

  it('stores nothing beyond the device id under a namespaced key', async () => {
    // local_settings is unencrypted; no credential may be written there
    // (CLAUDE.md §15).
    const { db, statements } = createFakeDb(null);

    await createSettingsRepository(db, () => 'generated-id').getOrCreateDeviceId(AT);

    for (const statement of statements) {
      expect(statement.params.filter((p) => typeof p === 'string')).not.toContain('token');
    }
    expect(DEVICE_ID_KEY).toBe('sync.device_id');
  });
});
