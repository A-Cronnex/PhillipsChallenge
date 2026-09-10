/**
 * The Postgres store, against a fake driver.
 *
 * A real Postgres is not available in CI, so what is covered here is the
 * behaviour the store itself owns: the order of statements inside the
 * transaction, that a conflict archives before it overwrites, that a failure
 * rolls back and releases the connection, and how driver errors are
 * classified. The SQL text itself is not verified against a real engine — see
 * docs/sync-api.md §12 for what that leaves outstanding.
 */
import { createPostgresSyncStore } from '../../server/src/infrastructure/postgres/postgres-sync-store';
import { SQLSTATE } from '../../server/src/infrastructure/postgres/sql-executor';
import type {
  SqlConnection,
  SqlPool,
} from '../../server/src/infrastructure/postgres/sql-executor';
import type { EntitySyncState, SyncDecision } from '../../server/src/domain/conflict';
import type { ValidatedChange } from '../../server/src/validation/validate-change';

const ENTITY_ID = '44444444-4444-4444-8444-444444444444';
const DEVICE_ID = '33333333-3333-4333-8333-333333333333';
const CONTEXT = { deviceId: DEVICE_ID, receivedAt: '2026-09-09T14:48:00.000Z' };

const CHANGE: ValidatedChange = {
  entityType: 'site',
  entityId: ENTITY_ID,
  localVersion: 2,
  baseServerVersion: 1,
  updatedAt: '2026-09-01T10:00:00.000Z',
  payload: {
    name: 'Hospital Santo Tomás',
    country: 'Panamá',
    city: 'Ciudad de Panamá',
    latitude: 8.98,
    longitude: -79.52,
    address: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  },
};

interface FakePool extends SqlPool {
  statements: string[];
  params: unknown[][];
  released: number;
}

interface FakeOptions {
  stateRow?: Record<string, unknown>;
  snapshot?: unknown;
  failOn?: { match: RegExp; error: unknown };
}

function firstWord(sql: string): string {
  const trimmed = sql.trim().replace(/\s+/g, ' ');
  if (/^SELECT pg_advisory_xact_lock/i.test(trimmed)) return 'LOCK';
  if (/^SELECT .*FROM sync_entity_state/is.test(trimmed)) return 'SELECT sync_entity_state';
  if (/^SELECT .*to_jsonb/is.test(trimmed)) return 'SELECT snapshot';
  if (/^INSERT INTO sync_conflicts/i.test(trimmed)) return 'INSERT sync_conflicts';
  if (/^INSERT INTO sync_entity_state/i.test(trimmed)) return 'INSERT sync_entity_state';
  if (/^INSERT INTO sites/i.test(trimmed)) return 'UPSERT sites';
  return trimmed.split(' ')[0].toUpperCase();
}

function createFakePool(options: FakeOptions = {}): FakePool {
  const statements: string[] = [];
  const params: unknown[][] = [];
  let released = 0;

  const connection: SqlConnection = {
    async query<R>(text: string, values: readonly unknown[] = []) {
      statements.push(firstWord(text));
      params.push([...values]);

      if (options.failOn && options.failOn.match.test(text)) {
        throw options.failOn.error;
      }

      if (/FROM sync_entity_state/is.test(text)) {
        return {
          rows: (options.stateRow ? [options.stateRow] : []) as R[],
          rowCount: options.stateRow ? 1 : 0,
        };
      }
      if (/to_jsonb/is.test(text)) {
        return {
          rows: [{ state: options.snapshot ?? { name: 'previous' } }] as R[],
          rowCount: 1,
        };
      }
      return { rows: [] as R[], rowCount: 0 };
    },
    release() {
      released += 1;
    },
  };

  return {
    statements,
    params,
    get released() {
      return released;
    },
    async query<R>() {
      return { rows: [] as R[], rowCount: 0 };
    },
    async connect() {
      return connection;
    },
  } as FakePool;
}

const applyDecision =
  (decision: SyncDecision) => (_current: EntitySyncState | null) => decision;

describe('createPostgresSyncStore', () => {
  it('locks the entity before reading its sync state', async () => {
    // SELECT ... FOR UPDATE locks nothing when the row does not exist, so two
    // devices creating the same entity would both compute version 1. The
    // advisory lock is what serialises them.
    const pool = createFakePool();
    const store = createPostgresSyncStore({ pool });

    await store.applyChange(
      CHANGE,
      CONTEXT,
      applyDecision({ kind: 'apply', nextServerVersion: 1, overwrittenServerVersion: null })
    );

    expect(pool.statements.slice(0, 3)).toEqual([
      'BEGIN',
      'LOCK',
      'SELECT sync_entity_state',
    ]);
  });

  it('writes the payload and the new sync state, then commits', async () => {
    const pool = createFakePool();
    const store = createPostgresSyncStore({ pool });

    const outcome = await store.applyChange(
      CHANGE,
      CONTEXT,
      applyDecision({ kind: 'apply', nextServerVersion: 1, overwrittenServerVersion: null })
    );

    expect(outcome.status).toBe('ok');
    expect(pool.statements).toEqual([
      'BEGIN',
      'LOCK',
      'SELECT sync_entity_state',
      'UPSERT sites',
      'INSERT sync_entity_state',
      'COMMIT',
    ]);
    expect(pool.released).toBe(1);
  });

  it('archives the replaced state before overwriting it', async () => {
    // docs/offline-sync.md §11: a conflict must not be resolved by silently
    // discarding data. Client-wins requires the overwrite, so the archive has
    // to happen first — after the upsert the old state is already gone.
    const pool = createFakePool({ snapshot: { name: 'Nombre anterior' } });
    const store = createPostgresSyncStore({ pool });

    await store.applyChange(
      CHANGE,
      CONTEXT,
      applyDecision({ kind: 'apply', nextServerVersion: 6, overwrittenServerVersion: 5 })
    );

    expect(pool.statements).toEqual([
      'BEGIN',
      'LOCK',
      'SELECT sync_entity_state',
      'SELECT snapshot',
      'INSERT sync_conflicts',
      'UPSERT sites',
      'INSERT sync_entity_state',
      'COMMIT',
    ]);

    const archive = pool.params[pool.statements.indexOf('INSERT sync_conflicts')];
    expect(archive).toContain(5);
    expect(archive).toContain(DEVICE_ID);
    expect(archive).toContain(JSON.stringify({ name: 'Nombre anterior' }));
  });

  it('does not archive anything on a clean update', async () => {
    const pool = createFakePool();
    const store = createPostgresSyncStore({ pool });

    await store.applyChange(
      CHANGE,
      CONTEXT,
      applyDecision({ kind: 'apply', nextServerVersion: 2, overwrittenServerVersion: null })
    );

    expect(pool.statements).not.toContain('INSERT sync_conflicts');
  });

  it('writes nothing when the decision is a replay', async () => {
    const pool = createFakePool({
      stateRow: {
        server_version: 4,
        last_applied_device_id: DEVICE_ID,
        last_applied_local_version: 2,
        last_outcome: 'synchronized',
        last_previous_version: null,
      },
    });
    const store = createPostgresSyncStore({ pool });

    const outcome = await store.applyChange(
      CHANGE,
      CONTEXT,
      applyDecision({
        kind: 'replay',
        outcome: 'synchronized',
        serverVersion: 4,
        previousServerVersion: null,
      })
    );

    expect(outcome).toMatchObject({ status: 'ok' });
    expect(pool.statements).toEqual([
      'BEGIN',
      'LOCK',
      'SELECT sync_entity_state',
      'COMMIT',
    ]);
  });

  it('passes the stored sync state to the decision', async () => {
    const pool = createFakePool({
      stateRow: {
        server_version: 7,
        last_applied_device_id: 'another',
        last_applied_local_version: 3,
        last_outcome: 'conflict_overwritten',
        last_previous_version: 6,
      },
    });
    const store = createPostgresSyncStore({ pool });
    const decide = jest.fn(
      (): SyncDecision => ({
        kind: 'apply',
        nextServerVersion: 8,
        overwrittenServerVersion: 7,
      })
    );

    await store.applyChange(CHANGE, CONTEXT, decide);

    expect(decide).toHaveBeenCalledWith({
      serverVersion: 7,
      lastAppliedDeviceId: 'another',
      lastAppliedLocalVersion: 3,
      lastOutcome: 'conflict_overwritten',
      lastPreviousVersion: 6,
    });
  });

  it('rolls back and releases the connection when a write fails', async () => {
    const pool = createFakePool({
      failOn: { match: /INSERT INTO sites/i, error: { code: SQLSTATE.CHECK_VIOLATION } },
    });
    const store = createPostgresSyncStore({ pool });

    const outcome = await store.applyChange(
      CHANGE,
      CONTEXT,
      applyDecision({ kind: 'apply', nextServerVersion: 1, overwrittenServerVersion: null })
    );

    expect(outcome.status).toBe('constraint_violation');
    expect(pool.statements).toContain('ROLLBACK');
    expect(pool.statements).not.toContain('COMMIT');
    expect(pool.released).toBe(1);
  });

  it('classifies a foreign key violation as a retryable missing reference', async () => {
    // The referenced site simply has not been uploaded yet.
    const pool = createFakePool({
      failOn: {
        match: /INSERT INTO sites/i,
        error: { code: SQLSTATE.FOREIGN_KEY_VIOLATION, constraint: 'observations_site_id_fkey' },
      },
    });
    const store = createPostgresSyncStore({ pool });

    const outcome = await store.applyChange(
      CHANGE,
      CONTEXT,
      applyDecision({ kind: 'apply', nextServerVersion: 1, overwrittenServerVersion: null })
    );

    expect(outcome).toMatchObject({ status: 'missing_reference' });
    if (outcome.status === 'missing_reference') {
      expect(outcome.detail).toContain('observations_site_id_fkey');
    }
  });

  it('classifies an unknown driver error as a retryable storage error', async () => {
    const pool = createFakePool({
      failOn: { match: /INSERT INTO sites/i, error: new Error('socket hang up') },
    });
    const store = createPostgresSyncStore({ pool });

    const outcome = await store.applyChange(
      CHANGE,
      CONTEXT,
      applyDecision({ kind: 'apply', nextServerVersion: 1, overwrittenServerVersion: null })
    );

    expect(outcome).toMatchObject({ status: 'storage_error' });
  });

  it('never puts row values into the error detail or the log', async () => {
    // Postgres embeds the offending values in `detail` and `message`; those are
    // hospital data and must not reach a response or a log (CLAUDE.md §15).
    const logError = jest.fn();
    const pool = createFakePool({
      failOn: {
        match: /INSERT INTO sites/i,
        error: {
          code: SQLSTATE.CHECK_VIOLATION,
          constraint: 'sites_latitude_check',
          detail: 'Failing row contains (Hospital Santo Tomás, 999)',
          message: 'new row for relation "sites" violates check constraint',
        },
      },
    });
    const store = createPostgresSyncStore({ pool, logError });

    const outcome = await store.applyChange(
      CHANGE,
      CONTEXT,
      applyDecision({ kind: 'apply', nextServerVersion: 1, overwrittenServerVersion: null })
    );

    const detail = outcome.status === 'ok' ? '' : outcome.detail;
    expect(detail).not.toContain('Santo Tomás');
    expect(logError.mock.calls.flat().join(' ')).not.toContain('Santo Tomás');
  });
});
