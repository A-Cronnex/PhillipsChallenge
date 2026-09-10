/**
 * The local synchronization queue.
 *
 * Exercised against an in-memory fake driver, for the same reason as
 * tests/database/migrations.test.ts: `expo-sqlite` has no Node implementation,
 * so anything that opens a real database has to run on a device. What is
 * covered here is the logic the repository owns — which rows it claims, how it
 * assembles a payload from four tables, what it does with a queue row whose
 * entity has vanished, and the guard on `markSynchronized`. The SQL is not
 * executed by a real engine; see docs/sync-api.md §12.
 */
import type * as SQLite from 'expo-sqlite';

import { createSyncRepository } from '../../database/repositories/sync-repository';
import type { ObservationPayload } from '../../types/sync-contract';

const AT = '2026-09-09T14:48:00.000Z';

interface Statement {
  sql: string;
  params: unknown[];
}

interface FakeOptions {
  syncRecords?: Record<string, unknown>[];
  observations?: Record<string, unknown>[];
  sites?: Record<string, unknown>[];
  confidence?: Record<string, unknown>[];
  sources?: Record<string, unknown>[];
  /** How many rows each UPDATE reports as changed. */
  changes?: number;
}

interface FakeDb {
  db: SQLite.SQLiteDatabase;
  statements: Statement[];
}

function createFakeDb(options: FakeOptions = {}): FakeDb {
  const statements: Statement[] = [];

  const db = {
    async getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      statements.push({ sql, params });
      if (/FROM sync_records/i.test(sql)) return (options.syncRecords ?? []) as T[];
      if (/FROM sites/i.test(sql)) return (options.sites ?? []) as T[];
      if (/FROM observations/i.test(sql)) return (options.observations ?? []) as T[];
      if (/FROM attribute_confidence/i.test(sql)) return (options.confidence ?? []) as T[];
      if (/FROM observation_sources/i.test(sql)) return (options.sources ?? []) as T[];
      return [] as T[];
    },
    async runAsync(sql: string, params: unknown[] = []) {
      statements.push({ sql, params });
      return { changes: options.changes ?? 1, lastInsertRowId: 0 };
    },
    async withTransactionAsync(task: () => Promise<void>) {
      await task();
    },
  } as unknown as SQLite.SQLiteDatabase;

  return { db, statements };
}

function syncRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sync-1',
    entity_type: 'observation',
    entity_id: 'obs-1',
    operation: 'create',
    local_version: 1,
    server_version: null,
    ...overrides,
  };
}

function observationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'obs-1',
    site_id: 'site-1',
    equipment_id: null,
    conversation_id: null,
    visit_date: '2026-09-01',
    quantity: 2,
    brand: 'Philips',
    model: 'IntelliVue MX450',
    modality: 'Monitor',
    estimated_years_of_use: 3,
    estimated_installation_year: null,
    operational_status: 'operativo',
    capture_source: 'text',
    notes: 'Dos monitores en la sala de emergencias.',
    overall_confidence: 'high',
    created_by: 'user-1',
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-02T11:00:00.000Z',
    ...overrides,
  };
}

describe('claimPendingChanges', () => {
  it('claims nothing and issues no statements for a non-positive limit', async () => {
    const { db, statements } = createFakeDb();
    const repository = createSyncRepository(db);

    const claimed = await repository.claimPendingChanges(0, AT);

    expect(claimed).toEqual({ changes: [], orphaned: 0 });
    expect(statements).toEqual([]);
  });

  it('claims parents before children, oldest first within each entity type', async () => {
    // A failed upload must be retryable (docs/offline-sync.md §6), so `failed`
    // rows belong in the queue alongside `pending` ones.
    const { db, statements } = createFakeDb({
      syncRecords: [syncRecord()],
      observations: [observationRow()],
    });

    await createSyncRepository(db).claimPendingChanges(50, AT);

    const select = statements.find((s) => /SELECT[\s\S]*FROM sync_records/i.test(s.sql));
    expect(select?.sql).toMatch(/sync_status IN \('pending', 'failed'\)/);
    expect(select?.sql).toMatch(/ORDER BY CASE entity_type WHEN 'site' THEN 0/);
    expect(select?.params).toContain(50);
  });

  it('marks the claimed rows syncing so a second run cannot claim them', async () => {
    const { db, statements } = createFakeDb({
      syncRecords: [syncRecord()],
      observations: [observationRow()],
    });

    await createSyncRepository(db).claimPendingChanges(50, AT);

    const update = statements.find((s) => /UPDATE sync_records[\s\S]*'syncing'/i.test(s.sql));
    expect(update).toBeDefined();
    expect(update?.params).toContain('sync-1');
  });

  it('assembles an observation payload with its confidence and source rows', async () => {
    // The children have no sync record of their own; they travel with the
    // observation (types/domain.ts, docs/database.md §12).
    const { db } = createFakeDb({
      syncRecords: [syncRecord()],
      observations: [observationRow()],
      confidence: [
        {
          observation_id: 'obs-1',
          attribute_name: 'brand',
          confidence_level: 'high',
          attribute_status: 'reported',
          source: 'text',
        },
        {
          observation_id: 'other',
          attribute_name: 'model',
          confidence_level: 'low',
          attribute_status: 'estimated',
          source: 'voice',
        },
      ],
      sources: [{ observation_id: 'obs-1', source: 'text', reference: null }],
    });

    const claimed = await createSyncRepository(db).claimPendingChanges(50, AT);
    const payload = claimed.changes[0].payload as ObservationPayload;

    // Grouped by observation: another observation's rows must not leak in.
    expect(payload.attributeConfidence).toEqual([
      {
        attributeName: 'brand',
        confidenceLevel: 'high',
        attributeStatus: 'reported',
        source: 'text',
      },
    ]);
    expect(payload.sources).toEqual([{ source: 'text', reference: null }]);
  });

  it('maps every observation column onto the wire payload', async () => {
    const { db } = createFakeDb({
      syncRecords: [syncRecord()],
      observations: [observationRow()],
    });

    const claimed = await createSyncRepository(db).claimPendingChanges(50, AT);
    const payload = claimed.changes[0].payload as ObservationPayload;

    expect(payload).toMatchObject({
      siteId: 'site-1',
      visitDate: '2026-09-01',
      quantity: 2,
      brand: 'Philips',
      modality: 'Monitor',
      estimatedYearsOfUse: 3,
      operationalStatus: 'operativo',
      overallConfidence: 'high',
      createdBy: 'user-1',
    });
    // Free text goes up in the user's own language, unmodified
    // (docs/tech-stack.md §7.2).
    expect(payload.notes).toBe('Dos monitores en la sala de emergencias.');
  });

  it("takes the change's updatedAt from the entity, not from the queue row", async () => {
    const { db } = createFakeDb({
      syncRecords: [syncRecord()],
      observations: [observationRow({ updated_at: '2026-09-02T11:00:00.000Z' })],
    });

    const claimed = await createSyncRepository(db).claimPendingChanges(50, AT);

    expect(claimed.changes[0].updatedAt).toBe('2026-09-02T11:00:00.000Z');
  });

  it('passes the stored server version as the conflict base', async () => {
    // This value is the entire basis of conflict detection on the server.
    const { db } = createFakeDb({
      syncRecords: [syncRecord({ server_version: 4, local_version: 6 })],
      observations: [observationRow()],
    });

    const claimed = await createSyncRepository(db).claimPendingChanges(50, AT);

    expect(claimed.changes[0]).toMatchObject({ baseServerVersion: 4, localVersion: 6 });
  });

  it('fails an orphaned queue row instead of deleting it, and excludes it', async () => {
    // `sync_records.entity_id` has no foreign key (docs/database.md §17.6), so
    // a queue row can outlive its entity. Deleting the row to tidy up is how an
    // unsynchronized record disappears unnoticed (CLAUDE.md §6).
    const { db, statements } = createFakeDb({
      syncRecords: [syncRecord(), syncRecord({ id: 'sync-2', entity_id: 'obs-2' })],
      observations: [observationRow()],
    });

    const claimed = await createSyncRepository(db).claimPendingChanges(50, AT);

    expect(claimed.orphaned).toBe(1);
    expect(claimed.changes.map((change) => change.entityId)).toEqual(['obs-1']);
    const failure = statements.find((s) => /'failed'/.test(s.sql) && s.params.includes('sync-2'));
    expect(failure).toBeDefined();
    expect(statements.some((s) => /DELETE\s+FROM sync_records/i.test(s.sql))).toBe(false);
  });

  it('queries only the entity types present in the batch', async () => {
    const { db, statements } = createFakeDb({
      syncRecords: [syncRecord()],
      observations: [observationRow()],
    });

    await createSyncRepository(db).claimPendingChanges(50, AT);

    expect(statements.some((s) => /FROM sites/i.test(s.sql))).toBe(false);
    expect(statements.some((s) => /FROM equipment/i.test(s.sql))).toBe(false);
  });
});

describe('markSynchronized', () => {
  it('guards on the uploaded local version', async () => {
    // If the record was edited while the upload was in flight, no row matches
    // and the caller requeues instead of marking a superseded version stored.
    const { db, statements } = createFakeDb();

    await createSyncRepository(db).markSynchronized(
      { entityType: 'observation', entityId: 'obs-1' },
      7,
      3,
      AT
    );

    const update = statements[0];
    expect(update.sql).toMatch(/local_version = \?/);
    expect(update.params).toEqual([7, AT, AT, 'observation', 'obs-1', 3]);
  });

  it('reports false when no row matched', async () => {
    const { db } = createFakeDb({ changes: 0 });

    const applied = await createSyncRepository(db).markSynchronized(
      { entityType: 'observation', entityId: 'obs-1' },
      7,
      3,
      AT
    );

    expect(applied).toBe(false);
  });

  it('clears the previous error on success', async () => {
    const { db, statements } = createFakeDb();

    await createSyncRepository(db).markSynchronized(
      { entityType: 'observation', entityId: 'obs-1' },
      7,
      3,
      AT
    );

    expect(statements[0].sql).toMatch(/last_error = NULL/);
  });
});

describe('markFailed', () => {
  it('stores the reason so the user can see why', async () => {
    const { db, statements } = createFakeDb();

    await createSyncRepository(db).markFailed(
      { entityType: 'observation', entityId: 'obs-1' },
      'Sin conexión',
      AT
    );

    expect(statements[0].sql).toMatch(/'failed'/);
    expect(statements[0].params).toContain('Sin conexión');
  });

  it('truncates an overlong reason rather than growing the row without bound', async () => {
    const { db, statements } = createFakeDb();

    await createSyncRepository(db).markFailed(
      { entityType: 'observation', entityId: 'obs-1' },
      'x'.repeat(5000),
      AT
    );

    const stored = statements[0].params[0] as string;
    expect(stored.length).toBeLessThanOrEqual(500);
  });
});

describe('releaseStaleSyncing', () => {
  it('returns every syncing row to pending and reports the count', async () => {
    // Anything still `syncing` when a run starts belongs to a run that was
    // killed; leaving it there means it is never retried.
    const { db, statements } = createFakeDb({ changes: 4 });

    const reclaimed = await createSyncRepository(db).releaseStaleSyncing(AT);

    expect(reclaimed).toBe(4);
    expect(statements[0].sql).toMatch(/sync_status = 'syncing'/);
    expect(statements[0].sql).toMatch(/SET sync_status = 'pending'/);
  });
});

describe('the queue never touches business data', () => {
  it('issues no write against an entity table during a full cycle', async () => {
    // This is what makes a failed or half-finished run harmless to the local
    // dataset (docs/offline-sync.md §3).
    const { db, statements } = createFakeDb({
      syncRecords: [syncRecord()],
      observations: [observationRow()],
    });
    const repository = createSyncRepository(db);
    const ref = { entityType: 'observation' as const, entityId: 'obs-1' };

    await repository.releaseStaleSyncing(AT);
    await repository.claimPendingChanges(50, AT);
    await repository.markSynchronized(ref, 1, 1, AT);
    await repository.markFailed(ref, 'x', AT);
    await repository.releaseToPending(ref, AT);

    const writes = statements.filter((s) =>
      /^\s*(INSERT|UPDATE|DELETE)/i.test(s.sql)
    );
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) {
      expect(write.sql).toMatch(/sync_records/i);
      expect(write.sql).not.toMatch(/\b(observations|sites|equipment|conversations)\b/i);
    }
  });
});
