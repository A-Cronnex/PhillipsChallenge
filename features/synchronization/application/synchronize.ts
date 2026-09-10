/**
 * One synchronization run.
 *
 * Everything the run does to the local database is a state transition on
 * `sync_records`; it never edits, deletes or rewrites a business record. That
 * is the property that keeps the offline dataset intact no matter how the run
 * ends (docs/offline-sync.md §3, §6).
 *
 * The run is explicitly *not* wired into capture. Saving an observation must
 * not wait on it and must not fail because of it (CLAUDE.md §6); this is
 * invoked separately, when the user asks or when connectivity appears.
 */
import type { SyncRequest, SyncResponse } from '../../../types/sync-contract';
import { MAX_CHANGES_PER_BATCH } from '../../../types/sync-contract';
import {
  MISSING_RESULT_MESSAGE,
  TRANSPORT_FAILURE_MESSAGE,
  mapResultToLocalOutcome,
} from '../domain/outcome-mapping';
import {
  changeKey,
  chunk,
  toSyncChange,
  type PendingChange,
} from '../domain/pending-change';
import type { EntityRef, SyncQueueRepository, SyncTransport } from './ports';

/**
 * How many queued rows one run uploads at most.
 *
 * A cap, rather than "everything pending", so a device returning from a long
 * offline stretch produces a bounded amount of work and a bounded amount of
 * time on a bad connection. What is left over stays `pending` and goes out on
 * the next run — the queue is durable, so nothing is lost by stopping early.
 *
 * 200 (four full batches) is a starting value, not a measured one.
 */
export const MAX_CHANGES_PER_RUN = 200;

export interface ConflictNotice extends EntityRef {
  serverVersion: number;
  previousServerVersion: number | null;
}

export interface RejectionNotice extends EntityRef {
  message: string;
  retryable: boolean;
}

export interface SyncRunReport {
  status:
    /** No sync server is configured, so the run did nothing at all. */
    | 'not_configured'
    | 'nothing_pending'
    | 'completed'
    | 'transport_failed';
  /** Rows recovered from a previous run that was interrupted. */
  reclaimed: number;
  /** Rows whose entity row was missing; marked failed, not uploaded. */
  orphaned: number;
  attempted: number;
  synchronized: number;
  /**
   * Records where the device version replaced a diverged server version.
   *
   * This is the only place a resolved conflict is visible
   * (docs/sync-api.md §8): it is a report from the run, not a durable local
   * flag, so a caller that discards it discards the notification.
   */
  conflicts: ConflictNotice[];
  rejected: RejectionNotice[];
  /**
   * Records the server confirmed but that changed locally mid-run. They were
   * requeued rather than marked synchronized.
   */
  requeuedAfterLocalChange: number;
  /** Present only when a batch failed to reach the server. */
  transportError: string | null;
}

export interface SynchronizeDeps {
  queue: SyncQueueRepository;
  /**
   * `null` when no sync server is configured (services/sync/config.ts).
   *
   * Handled here rather than by the caller so that "there is no backend yet"
   * can never be mistaken for "the upload failed": with no transport the run
   * returns immediately, claims nothing, and marks nothing `failed`. Every
   * record simply stays `pending`, which is its correct state
   * (features/observations/application/capture-observation.ts).
   */
  transport: SyncTransport | null;
  /** Stable per-installation id; drives replay detection on the server. */
  deviceId: string;
  now: () => Date;
  maxChangesPerRun?: number;
  batchSize?: number;
}

function refOf(change: PendingChange): EntityRef {
  return { entityType: change.entityType, entityId: change.entityId };
}

function emptyReport(): SyncRunReport {
  return {
    status: 'nothing_pending',
    reclaimed: 0,
    orphaned: 0,
    attempted: 0,
    synchronized: 0,
    conflicts: [],
    rejected: [],
    requeuedAfterLocalChange: 0,
    transportError: null,
  };
}

function indexResults(response: SyncResponse) {
  const byKey = new Map<string, SyncResponse['results'][number]>();
  for (const result of response.results) {
    byKey.set(changeKey(result.entityType, result.entityId), result);
  }
  return byKey;
}

export async function runSynchronization(
  deps: SynchronizeDeps
): Promise<SyncRunReport> {
  const report = emptyReport();
  const timestamp = () => deps.now().toISOString();

  if (deps.transport === null) {
    report.status = 'not_configured';
    return report;
  }
  const transport = deps.transport;

  report.reclaimed = await deps.queue.releaseStaleSyncing(timestamp());

  const claimed = await deps.queue.claimPendingChanges(
    deps.maxChangesPerRun ?? MAX_CHANGES_PER_RUN,
    timestamp()
  );
  report.orphaned = claimed.orphaned;

  if (claimed.changes.length === 0) {
    // `reclaimed`/`orphaned` may still be non-zero: the run did real work, it
    // just has nothing to upload.
    return report;
  }

  const batches = chunk(claimed.changes, deps.batchSize ?? MAX_CHANGES_PER_BATCH);
  report.status = 'completed';

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const request: SyncRequest = {
      deviceId: deps.deviceId,
      clientTime: timestamp(),
      changes: batch.map(toSyncChange),
    };

    const result = await transport.push(request);

    if (result.status === 'failed') {
      report.status = 'transport_failed';
      report.transportError = result.reason;

      // This batch was attempted and did not land: record the failure against
      // its records so the user can see why.
      for (const change of batch) {
        report.attempted += 1;
        await deps.queue.markFailed(refOf(change), TRANSPORT_FAILURE_MESSAGE, timestamp());
        report.rejected.push({
          ...refOf(change),
          message: TRANSPORT_FAILURE_MESSAGE,
          retryable: result.retryable,
        });
      }

      // Later batches were never attempted. Returning them to `pending`
      // rather than `failed` keeps `failed` meaning "the server or the network
      // refused this", instead of "this run stopped before reaching it".
      for (const remaining of batches.slice(index + 1)) {
        for (const change of remaining) {
          await deps.queue.releaseToPending(refOf(change), timestamp());
        }
      }
      return report;
    }

    const results = indexResults(result.response);

    for (const change of batch) {
      report.attempted += 1;
      const ref = refOf(change);
      const serverResult = results.get(changeKey(change.entityType, change.entityId));

      if (!serverResult) {
        await deps.queue.markFailed(ref, MISSING_RESULT_MESSAGE, timestamp());
        report.rejected.push({ ...ref, message: MISSING_RESULT_MESSAGE, retryable: true });
        continue;
      }

      const outcome = mapResultToLocalOutcome(serverResult);

      if (outcome.kind === 'failed') {
        await deps.queue.markFailed(ref, outcome.message, timestamp());
        report.rejected.push({
          ...ref,
          message: outcome.message,
          retryable: outcome.retryable,
        });
        continue;
      }

      const applied = await deps.queue.markSynchronized(
        ref,
        outcome.serverVersion,
        change.localVersion,
        timestamp()
      );

      if (!applied) {
        // The record was edited after it was claimed. The server holds the
        // older version; the newer one has to go out on a later run, so the
        // row goes back to `pending` instead of being marked synchronized.
        await deps.queue.releaseToPending(ref, timestamp());
        report.requeuedAfterLocalChange += 1;
        continue;
      }

      report.synchronized += 1;
      if (outcome.overwroteServer) {
        report.conflicts.push({
          ...ref,
          serverVersion: outcome.serverVersion,
          previousServerVersion: outcome.previousServerVersion,
        });
      }
    }
  }

  return report;
}
