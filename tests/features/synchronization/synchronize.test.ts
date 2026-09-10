/**
 * One synchronization run.
 *
 * These are the offline rules made executable (docs/offline-sync.md §3, §6,
 * §7, §11): a run must never lose a queued record, must never mark a record
 * synchronized that the server did not confirm, must be resumable when it is
 * interrupted, and must be retryable after it fails.
 */
import {
  runSynchronization,
  type SynchronizeDeps,
} from '../../../features/synchronization/application/synchronize';
import type {
  ClaimedQueue,
  EntityRef,
  SyncQueueRepository,
  SyncTransport,
  TransportResult,
} from '../../../features/synchronization/application/ports';
import type { PendingChange } from '../../../features/synchronization/domain/pending-change';
import type { SyncRequest, SyncResult } from '../../../types/sync-contract';

const NOW = new Date('2026-09-09T14:48:00.000Z');
const DEVICE_ID = 'device-1';

function pending(id: string, overrides: Partial<PendingChange> = {}): PendingChange {
  return {
    entityType: 'observation',
    entityId: id,
    operation: 'create',
    localVersion: 1,
    baseServerVersion: null,
    updatedAt: '2026-09-01T10:00:00.000Z',
    payload: {
      siteId: 'site-1',
      equipmentId: null,
      conversationId: null,
      visitDate: '2026-09-01',
      quantity: 1,
      brand: 'Philips',
      model: null,
      modality: null,
      estimatedYearsOfUse: null,
      estimatedInstallationYear: null,
      operationalStatus: null,
      captureSource: 'text',
      notes: null,
      overallConfidence: 'high',
      createdBy: 'user-1',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
      attributeConfidence: [],
      sources: [],
    },
    ...overrides,
  };
}

interface QueueOptions {
  claimed?: PendingChange[];
  stale?: number;
  orphaned?: number;
  /** Entity ids for which markSynchronized reports a stale local version. */
  staleOnMark?: string[];
}

interface RecordingQueue extends SyncQueueRepository {
  synchronized: { ref: EntityRef; serverVersion: number; localVersion: number }[];
  failed: { ref: EntityRef; message: string }[];
  released: EntityRef[];
  claims: number;
}

function createQueue(options: QueueOptions = {}): RecordingQueue {
  const synchronized: RecordingQueue['synchronized'] = [];
  const failed: RecordingQueue['failed'] = [];
  const released: EntityRef[] = [];
  let claims = 0;

  return {
    synchronized,
    failed,
    released,
    get claims() {
      return claims;
    },
    async releaseStaleSyncing() {
      return options.stale ?? 0;
    },
    async claimPendingChanges(): Promise<ClaimedQueue> {
      claims += 1;
      return { changes: options.claimed ?? [], orphaned: options.orphaned ?? 0 };
    },
    async markSynchronized(ref, serverVersion, expectedLocalVersion) {
      if (options.staleOnMark?.includes(ref.entityId)) return false;
      synchronized.push({ ref, serverVersion, localVersion: expectedLocalVersion });
      return true;
    },
    async markFailed(ref, message) {
      failed.push({ ref, message });
    },
    async releaseToPending(ref) {
      released.push(ref);
    },
  };
}

interface RecordingTransport extends SyncTransport {
  requests: SyncRequest[];
}

function createTransport(
  responder: (request: SyncRequest, index: number) => TransportResult
): RecordingTransport {
  const requests: SyncRequest[] = [];
  return {
    requests,
    async push(request) {
      requests.push(request);
      return responder(request, requests.length - 1);
    },
  };
}

function confirmAll(request: SyncRequest): TransportResult {
  const results: SyncResult[] = request.changes.map((change) => ({
    entityType: change.entityType,
    entityId: change.entityId,
    outcome: 'synchronized',
    serverVersion: 1,
    replayed: false,
  }));
  return { status: 'ok', response: { serverTime: NOW.toISOString(), results } };
}

function deps(
  queue: SyncQueueRepository,
  transport: SyncTransport | null,
  overrides: Partial<SynchronizeDeps> = {}
): SynchronizeDeps {
  return { queue, transport, deviceId: DEVICE_ID, now: () => NOW, ...overrides };
}

describe('runSynchronization', () => {
  describe('when no server is configured', () => {
    it('does nothing at all and reports not_configured', async () => {
      // With no backend, every record is correctly `pending`. Claiming or
      // failing them would turn "there is nowhere to sync to" into an error the
      // user has to look at (features/observations/application/capture-observation.ts).
      const queue = createQueue({ claimed: [pending('obs-1')] });

      const report = await runSynchronization(deps(queue, null));

      expect(report.status).toBe('not_configured');
      expect(queue.claims).toBe(0);
      expect(queue.failed).toEqual([]);
      expect(queue.synchronized).toEqual([]);
    });
  });

  describe('with an empty queue', () => {
    it('reports nothing_pending without contacting the server', async () => {
      const transport = createTransport(confirmAll);
      const report = await runSynchronization(deps(createQueue(), transport));

      expect(report.status).toBe('nothing_pending');
      expect(transport.requests).toEqual([]);
    });

    it('still reports rows recovered from an interrupted run', async () => {
      const queue = createQueue({ stale: 3 });
      const report = await runSynchronization(deps(queue, createTransport(confirmAll)));

      expect(report).toMatchObject({ status: 'nothing_pending', reclaimed: 3 });
    });
  });

  describe('recovery from an interrupted run', () => {
    it('releases stale syncing rows before claiming', async () => {
      // A row left `syncing` by a killed process would otherwise never be
      // retried — silent data loss in everything but name.
      const queue = createQueue({ stale: 2, claimed: [pending('obs-1')] });

      const report = await runSynchronization(deps(queue, createTransport(confirmAll)));

      expect(report.reclaimed).toBe(2);
      expect(report.synchronized).toBe(1);
    });
  });

  describe('a successful run', () => {
    it('marks every confirmed record synchronized with its server version', async () => {
      const queue = createQueue({ claimed: [pending('obs-1'), pending('obs-2')] });
      const transport = createTransport((request) => ({
        status: 'ok',
        response: {
          serverTime: NOW.toISOString(),
          results: request.changes.map((change, index) => ({
            entityType: change.entityType,
            entityId: change.entityId,
            outcome: 'synchronized' as const,
            serverVersion: index + 7,
            replayed: false,
          })),
        },
      }));

      const report = await runSynchronization(deps(queue, transport));

      expect(report).toMatchObject({ status: 'completed', attempted: 2, synchronized: 2 });
      expect(queue.synchronized.map((entry) => entry.serverVersion)).toEqual([7, 8]);
    });

    it('sends the device id so the server can detect replays', async () => {
      const transport = createTransport(confirmAll);
      await runSynchronization(
        deps(createQueue({ claimed: [pending('obs-1')] }), transport)
      );

      expect(transport.requests[0].deviceId).toBe(DEVICE_ID);
    });

    it('splits the queue into batches of the configured size', async () => {
      // Batching is what makes a run resumable: an interrupted run leaves the
      // batches that already landed on the server alone.
      const claimed = ['a', 'b', 'c', 'd', 'e'].map((id) => pending(id));
      const transport = createTransport(confirmAll);

      await runSynchronization(
        deps(createQueue({ claimed }), transport, { batchSize: 2 })
      );

      expect(transport.requests.map((request) => request.changes.length)).toEqual([2, 2, 1]);
    });

    it('reports a client-wins overwrite as a conflict without leaving it queued', async () => {
      // docs/offline-sync.md §11 — the conflict is explicit, but the record is
      // synchronized, because under client-wins the device version is what the
      // server now holds.
      const queue = createQueue({ claimed: [pending('obs-1')] });
      const transport = createTransport(() => ({
        status: 'ok',
        response: {
          serverTime: NOW.toISOString(),
          results: [
            {
              entityType: 'observation',
              entityId: 'obs-1',
              outcome: 'conflict_overwritten',
              serverVersion: 6,
              previousServerVersion: 5,
              replayed: false,
            },
          ],
        },
      }));

      const report = await runSynchronization(deps(queue, transport));

      expect(report.synchronized).toBe(1);
      expect(report.conflicts).toEqual([
        {
          entityType: 'observation',
          entityId: 'obs-1',
          serverVersion: 6,
          previousServerVersion: 5,
        },
      ]);
      expect(queue.failed).toEqual([]);
    });
  });

  describe('when the server rejects a record', () => {
    it('marks it failed with a user-facing reason and keeps it locally', async () => {
      const queue = createQueue({ claimed: [pending('obs-1'), pending('obs-2')] });
      const transport = createTransport((request) => ({
        status: 'ok',
        response: {
          serverTime: NOW.toISOString(),
          results: [
            {
              entityType: 'observation',
              entityId: request.changes[0].entityId,
              outcome: 'rejected',
              code: 'invalid_payload',
              reason: 'server prose',
            },
            {
              entityType: 'observation',
              entityId: request.changes[1].entityId,
              outcome: 'synchronized',
              serverVersion: 1,
              replayed: false,
            },
          ],
        },
      }));

      const report = await runSynchronization(deps(queue, transport));

      expect(report).toMatchObject({ status: 'completed', synchronized: 1 });
      expect(queue.failed).toHaveLength(1);
      expect(queue.failed[0].ref.entityId).toBe('obs-1');
      expect(queue.failed[0].message).not.toBe('server prose');
      expect(report.rejected[0]).toMatchObject({ entityId: 'obs-1', retryable: false });
    });
  });

  describe('when the server answers but says nothing about a record', () => {
    it('marks it failed rather than assuming it was stored', async () => {
      // Assuming silence means success is exactly how a record ends up marked
      // synchronized while existing only on the device.
      const queue = createQueue({ claimed: [pending('obs-1'), pending('obs-2')] });
      const transport = createTransport(() => ({
        status: 'ok',
        response: {
          serverTime: NOW.toISOString(),
          results: [
            {
              entityType: 'observation',
              entityId: 'obs-1',
              outcome: 'synchronized',
              serverVersion: 1,
              replayed: false,
            },
          ],
        },
      }));

      const report = await runSynchronization(deps(queue, transport));

      expect(report.synchronized).toBe(1);
      expect(queue.failed).toHaveLength(1);
      expect(queue.failed[0].ref.entityId).toBe('obs-2');
      expect(report.rejected[0]).toMatchObject({ entityId: 'obs-2', retryable: true });
    });
  });

  describe('when the network fails mid-run', () => {
    it('fails the attempted batch and requeues the batches never sent', async () => {
      // The distinction matters: `failed` means the server or the network
      // refused this record, not that the run stopped before reaching it.
      const claimed = ['a', 'b', 'c', 'd'].map((id) => pending(id));
      const queue = createQueue({ claimed });
      const transport = createTransport((request, index) =>
        index === 0
          ? confirmAll(request)
          : { status: 'failed', reason: 'sin conexión', retryable: true }
      );

      const report = await runSynchronization(
        deps(queue, transport, { batchSize: 2 })
      );

      expect(report.status).toBe('transport_failed');
      expect(report.transportError).toBe('sin conexión');
      expect(queue.synchronized.map((entry) => entry.ref.entityId)).toEqual(['a', 'b']);
      expect(queue.failed.map((entry) => entry.ref.entityId)).toEqual(['c', 'd']);
      expect(queue.released).toEqual([]);
    });

    it('returns untouched later batches to pending, not to failed', async () => {
      const claimed = ['a', 'b', 'c', 'd'].map((id) => pending(id));
      const queue = createQueue({ claimed });
      const transport = createTransport(() => ({
        status: 'failed',
        reason: 'sin conexión',
        retryable: true,
      }));

      await runSynchronization(deps(queue, transport, { batchSize: 2 }));

      expect(queue.failed.map((entry) => entry.ref.entityId)).toEqual(['a', 'b']);
      expect(queue.released.map((ref) => ref.entityId)).toEqual(['c', 'd']);
    });

    it('stops after the first failed batch instead of hammering the network', async () => {
      const claimed = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => pending(id));
      const transport = createTransport(() => ({
        status: 'failed',
        reason: 'sin conexión',
        retryable: true,
      }));

      await runSynchronization(
        deps(createQueue({ claimed }), transport, { batchSize: 2 })
      );

      expect(transport.requests).toHaveLength(1);
    });

    it('never leaves a record marked syncing', async () => {
      const claimed = ['a', 'b', 'c'].map((id) => pending(id));
      const queue = createQueue({ claimed });
      const transport = createTransport(() => ({
        status: 'failed',
        reason: 'sin conexión',
        retryable: true,
      }));

      await runSynchronization(deps(queue, transport, { batchSize: 1 }));

      const resolved = new Set([
        ...queue.failed.map((entry) => entry.ref.entityId),
        ...queue.released.map((ref) => ref.entityId),
      ]);
      expect(resolved).toEqual(new Set(['a', 'b', 'c']));
    });
  });

  describe('when a record changes locally during the run', () => {
    it('requeues it instead of marking a superseded version synchronized', async () => {
      // The server holds the older version; the newer one has to go out later.
      // Marking it synchronized would strand the user's newer edit permanently.
      const queue = createQueue({
        claimed: [pending('obs-1'), pending('obs-2')],
        staleOnMark: ['obs-1'],
      });

      const report = await runSynchronization(
        deps(queue, createTransport(confirmAll))
      );

      expect(report.requeuedAfterLocalChange).toBe(1);
      expect(report.synchronized).toBe(1);
      expect(queue.released.map((ref) => ref.entityId)).toEqual(['obs-1']);
    });

    it('passes the claimed local version so the guard can compare it', async () => {
      const queue = createQueue({ claimed: [pending('obs-1', { localVersion: 4 })] });

      await runSynchronization(deps(queue, createTransport(confirmAll)));

      expect(queue.synchronized[0].localVersion).toBe(4);
    });
  });

  describe('orphaned queue rows', () => {
    it('reports rows whose entity no longer exists', async () => {
      const queue = createQueue({ claimed: [pending('obs-1')], orphaned: 2 });

      const report = await runSynchronization(deps(queue, createTransport(confirmAll)));

      expect(report.orphaned).toBe(2);
    });
  });
});
