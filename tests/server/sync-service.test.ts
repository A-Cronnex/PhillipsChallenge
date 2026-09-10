/**
 * The `/v1/sync` batch.
 *
 * The properties under test are the three the endpoint exists to guarantee:
 * one bad record does not fail the batch, a retry does not apply twice, and a
 * conflict is reported rather than resolved silently
 * (docs/offline-sync.md §6–§8, §11).
 */
import { synchronizeBatch } from '../../server/src/application/sync-service';
import type { ApplyOutcome, SyncStore } from '../../server/src/application/ports';
import type { EntitySyncState, SyncDecision } from '../../server/src/domain/conflict';
import type { ValidatedChange } from '../../server/src/validation/validate-change';
import type { Principal } from '../../server/src/validation/validate-change';
import { MAX_CHANGES_PER_BATCH, type SyncChange } from '../../types/sync-contract';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const DEVICE_ID = '33333333-3333-4333-8333-333333333333';
const PRINCIPAL: Principal = { userId: USER_ID, deviceId: DEVICE_ID };
const NOW = new Date('2026-09-09T14:48:00.000Z');

function uuid(seed: number): string {
  const hex = seed.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

function sitePayload() {
  return {
    name: 'Hospital Santo Tomás',
    country: 'Panamá',
    city: 'Ciudad de Panamá',
    latitude: 8.98,
    longitude: -79.52,
    address: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  };
}

function observationPayload(siteId: string) {
  return {
    siteId,
    equipmentId: null,
    conversationId: null,
    visitDate: '2026-09-01',
    quantity: 1,
    brand: 'Philips',
    model: null,
    modality: 'Monitor',
    estimatedYearsOfUse: null,
    estimatedInstallationYear: null,
    operationalStatus: null,
    captureSource: 'text',
    notes: null,
    overallConfidence: 'high',
    createdBy: USER_ID,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    attributeConfidence: [],
    sources: [{ source: 'text', reference: null }],
  };
}

/**
 * Builds a wire change. The cast is confined to this helper so individual
 * tests can override any field — including with a deliberately invalid value,
 * which is most of what these tests do.
 */
function siteChange(id: string, overrides: Record<string, unknown> = {}): SyncChange {
  return {
    entityType: 'site',
    entityId: id,
    operation: 'create',
    localVersion: 1,
    baseServerVersion: null,
    updatedAt: '2026-09-01T10:00:00.000Z',
    payload: sitePayload(),
    ...overrides,
  } as SyncChange;
}

interface StoreOptions {
  states?: Record<string, EntitySyncState>;
  failures?: Record<string, ApplyOutcome>;
}

interface RecordingStore extends SyncStore {
  applied: string[];
}

function createStore(options: StoreOptions = {}): RecordingStore {
  const applied: string[] = [];
  return {
    applied,
    async applyChange(
      change: ValidatedChange,
      _context,
      decide: (current: EntitySyncState | null) => SyncDecision
    ): Promise<ApplyOutcome> {
      const key = `${change.entityType}:${change.entityId}`;
      const failure = options.failures?.[key];
      if (failure) return failure;
      applied.push(key);
      return { status: 'ok', decision: decide(options.states?.[key] ?? null) };
    },
  };
}

const deps = (store: SyncStore) => ({ store, now: () => NOW });

describe('synchronizeBatch', () => {
  it('stores a clean batch and reports the server version of each record', async () => {
    const store = createStore();
    const result = await synchronizeBatch(
      { deviceId: DEVICE_ID, clientTime: NOW.toISOString(), changes: [siteChange(uuid(1))] },
      PRINCIPAL,
      deps(store)
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.response.serverTime).toBe(NOW.toISOString());
    expect(result.response.results).toEqual([
      {
        entityType: 'site',
        entityId: uuid(1),
        outcome: 'synchronized',
        serverVersion: 1,
        replayed: false,
      },
    ]);
  });

  it('applies a site before an observation that references it', async () => {
    // The device sends them in capture order; the server has to reorder or the
    // observation fails on a foreign key that is satisfied by the same batch.
    const store = createStore();
    const siteId = uuid(1);

    await synchronizeBatch(
      {
        deviceId: DEVICE_ID,
        clientTime: NOW.toISOString(),
        changes: [
          {
            entityType: 'observation',
            entityId: uuid(2),
            operation: 'create',
            localVersion: 1,
            baseServerVersion: null,
            updatedAt: '2026-09-01T10:00:00.000Z',
            payload: observationPayload(siteId),
          } as SyncChange,
          siteChange(siteId),
        ],
      },
      PRINCIPAL,
      deps(store)
    );

    expect(store.applied).toEqual([`site:${siteId}`, `observation:${uuid(2)}`]);
  });

  it('rejects one invalid record without failing the rest of the batch', async () => {
    // Otherwise a single permanently-invalid row blocks every other record on
    // the device forever.
    const store = createStore();
    const result = await synchronizeBatch(
      {
        deviceId: DEVICE_ID,
        clientTime: NOW.toISOString(),
        changes: [
          siteChange(uuid(1), { payload: { ...sitePayload(), name: '' } }),
          siteChange(uuid(2)),
        ],
      },
      PRINCIPAL,
      deps(store)
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    const byId = new Map(result.response.results.map((r) => [r.entityId, r]));
    expect(byId.get(uuid(1))).toMatchObject({ outcome: 'rejected', code: 'invalid_payload' });
    expect(byId.get(uuid(2))).toMatchObject({ outcome: 'synchronized' });
    expect(store.applied).toEqual([`site:${uuid(2)}`]);
  });

  it('reports a conflict explicitly instead of overwriting silently', async () => {
    const store = createStore({
      states: {
        [`site:${uuid(1)}`]: {
          serverVersion: 5,
          lastAppliedDeviceId: 'another-device',
          lastAppliedLocalVersion: 2,
          lastOutcome: 'synchronized',
          lastPreviousVersion: null,
        },
      },
    });

    const result = await synchronizeBatch(
      {
        deviceId: DEVICE_ID,
        clientTime: NOW.toISOString(),
        changes: [siteChange(uuid(1), { localVersion: 4, baseServerVersion: 3 })],
      },
      PRINCIPAL,
      deps(store)
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.response.results[0]).toEqual({
      entityType: 'site',
      entityId: uuid(1),
      outcome: 'conflict_overwritten',
      serverVersion: 6,
      previousServerVersion: 5,
      replayed: false,
    });
  });

  it('marks a replayed change as replayed and keeps its version', async () => {
    const store = createStore({
      states: {
        [`site:${uuid(1)}`]: {
          serverVersion: 4,
          lastAppliedDeviceId: DEVICE_ID,
          lastAppliedLocalVersion: 2,
          lastOutcome: 'synchronized',
          lastPreviousVersion: null,
        },
      },
    });

    const result = await synchronizeBatch(
      {
        deviceId: DEVICE_ID,
        clientTime: NOW.toISOString(),
        changes: [siteChange(uuid(1), { localVersion: 2, baseServerVersion: 3 })],
      },
      PRINCIPAL,
      deps(store)
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.response.results[0]).toMatchObject({
      outcome: 'synchronized',
      serverVersion: 4,
      replayed: true,
    });
  });

  it('maps a missing reference to a retryable rejection', async () => {
    const store = createStore({
      failures: {
        [`site:${uuid(1)}`]: { status: 'missing_reference', detail: 'site missing' },
      },
    });

    const result = await synchronizeBatch(
      { deviceId: DEVICE_ID, clientTime: NOW.toISOString(), changes: [siteChange(uuid(1))] },
      PRINCIPAL,
      deps(store)
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.response.results[0]).toMatchObject({
      outcome: 'rejected',
      code: 'missing_reference',
    });
  });

  it('maps a constraint violation to invalid_payload, not to a retryable error', async () => {
    // Retrying a value the schema refuses would loop forever.
    const store = createStore({
      failures: {
        [`site:${uuid(1)}`]: { status: 'constraint_violation', detail: 'check failed' },
      },
    });

    const result = await synchronizeBatch(
      { deviceId: DEVICE_ID, clientTime: NOW.toISOString(), changes: [siteChange(uuid(1))] },
      PRINCIPAL,
      deps(store)
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.response.results[0]).toMatchObject({
      outcome: 'rejected',
      code: 'invalid_payload',
    });
  });

  it('maps a storage error to a retryable rejection', async () => {
    const store = createStore({
      failures: {
        [`site:${uuid(1)}`]: { status: 'storage_error', detail: 'connection lost' },
      },
    });

    const result = await synchronizeBatch(
      { deviceId: DEVICE_ID, clientTime: NOW.toISOString(), changes: [siteChange(uuid(1))] },
      PRINCIPAL,
      deps(store)
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.response.results[0]).toMatchObject({
      outcome: 'rejected',
      code: 'storage_error',
    });
  });

  it('returns a result for every change it was sent', async () => {
    // The client marks anything without a result as unconfirmed, so a dropped
    // result is a record that never leaves the queue.
    const store = createStore();
    const changes = [
      siteChange(uuid(1)),
      siteChange(uuid(2), { payload: { ...sitePayload(), name: '' } }),
      siteChange(uuid(3)),
    ];

    const result = await synchronizeBatch(
      { deviceId: DEVICE_ID, clientTime: NOW.toISOString(), changes },
      PRINCIPAL,
      deps(store)
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.response.results).toHaveLength(3);
  });

  it('refuses a batch larger than the cap rather than truncating it', async () => {
    // Truncating would report success for a batch the client believes was
    // fully accepted.
    const store = createStore();
    const changes = Array.from({ length: MAX_CHANGES_PER_BATCH + 1 }, (_, index) =>
      siteChange(uuid(index + 1))
    );

    const result = await synchronizeBatch(
      { deviceId: DEVICE_ID, clientTime: NOW.toISOString(), changes },
      PRINCIPAL,
      deps(store)
    );

    expect(result).toMatchObject({ status: 'error', error: { code: 'batch_too_large' } });
    expect(store.applied).toEqual([]);
  });

  it('refuses a batch containing two changes for the same entity', async () => {
    const store = createStore();
    const result = await synchronizeBatch(
      {
        deviceId: DEVICE_ID,
        clientTime: NOW.toISOString(),
        changes: [siteChange(uuid(1)), siteChange(uuid(1), { localVersion: 2 })],
      },
      PRINCIPAL,
      deps(store)
    );

    expect(result).toMatchObject({ status: 'error', error: { code: 'malformed_request' } });
  });

  it('accepts an empty batch', async () => {
    const result = await synchronizeBatch(
      { deviceId: DEVICE_ID, clientTime: NOW.toISOString(), changes: [] },
      PRINCIPAL,
      deps(createStore())
    );

    expect(result).toMatchObject({ status: 'ok' });
    if (result.status === 'ok') expect(result.response.results).toEqual([]);
  });

  it('rejects a non-array changes field', async () => {
    const result = await synchronizeBatch(
      { deviceId: DEVICE_ID, clientTime: NOW.toISOString(), changes: 'nope' as never },
      PRINCIPAL,
      deps(createStore())
    );

    expect(result).toMatchObject({ status: 'error', error: { code: 'malformed_request' } });
  });

  it('never echoes payload contents in a rejection reason', async () => {
    // Reasons are stored and displayed by the client; hospital data must not
    // travel back inside them (CLAUDE.md §15).
    const store = createStore();
    const notes = 'Paciente en sala 3 con equipo dañado';
    const result = await synchronizeBatch(
      {
        deviceId: DEVICE_ID,
        clientTime: NOW.toISOString(),
        changes: [
          {
            entityType: 'observation',
            entityId: uuid(1),
            operation: 'create',
            localVersion: 1,
            baseServerVersion: null,
            updatedAt: '2026-09-01T10:00:00.000Z',
            payload: { ...observationPayload(uuid(2)), notes, visitDate: 'not-a-date' },
          } as SyncChange,
        ],
      },
      PRINCIPAL,
      deps(store)
    );

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(JSON.stringify(result.response)).not.toContain('Paciente');
  });
});
