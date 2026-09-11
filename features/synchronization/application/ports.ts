/**
 * Ports the synchronization run depends on.
 *
 * Two of them, kept apart on purpose: the local queue and the network are the
 * two things a sync run touches, and the whole offline design rests on the
 * first working when the second does not (docs/architecture.md §8).
 */
import type { SyncEntityType } from '../../../types/domain';
import type {
  PulledChange,
  SyncPullRequest,
  SyncPullResponse,
  SyncRequest,
  SyncResponse,
} from '../../../types/sync-contract';
import type { PendingChange } from '../domain/pending-change';

export interface EntityRef {
  entityType: SyncEntityType;
  entityId: string;
}

export interface ClaimedQueue {
  /** Claimed changes, already marked `syncing`, in creation order. */
  changes: PendingChange[];
  /**
   * How many claimed rows pointed at an entity that no longer exists.
   *
   * `sync_records.entity_id` is polymorphic and has no foreign key
   * (docs/database.md §17.6), so this is possible and has to be reported
   * rather than silently skipped. The implementation marks those rows
   * `failed`; they are excluded from `changes` because there is nothing to
   * upload.
   */
  orphaned: number;
}

export interface SyncQueueRepository {
  /**
   * Returns rows left in `syncing` to `pending` and reports how many.
   *
   * The app is a single process, so any row still `syncing` when a run starts
   * belongs to a run that was killed — by the OS, by a crash, by the user
   * closing the app mid-upload. Without this, those rows would sit in
   * `syncing` forever and never be retried, which is silent data loss in
   * everything but name (docs/offline-sync.md §6).
   */
  releaseStaleSyncing(at: string): Promise<number>;

  /**
   * Marks up to `limit` queued rows as `syncing` and returns them with their
   * entity payloads attached.
   *
   * Claims both `pending` and `failed` rows: a failed upload must be
   * retryable (docs/offline-sync.md §6). Ordered by creation time so the
   * oldest capture is uploaded first.
   */
  claimPendingChanges(limit: number, at: string): Promise<ClaimedQueue>;

  /**
   * Records a server confirmation.
   *
   * `expectedLocalVersion` guards against the record having been edited while
   * the upload was in flight: the update applies only if `local_version` is
   * still what was uploaded. Returns false when it is not, so the caller can
   * requeue instead of marking a stale version synchronized — which would
   * strand the user's newer edit permanently.
   */
  markSynchronized(
    ref: EntityRef,
    serverVersion: number,
    expectedLocalVersion: number,
    at: string
  ): Promise<boolean>;

  /** Records a failure and its reason, leaving the record retryable. */
  markFailed(ref: EntityRef, message: string, at: string): Promise<void>;

  /** Returns a claimed row to `pending` without recording a failure. */
  releaseToPending(ref: EntityRef, at: string): Promise<void>;
}

export type TransportResult =
  | { status: 'ok'; response: SyncResponse }
  /**
   * The batch did not reach the server, or the server refused it as a whole.
   * Nothing in it was applied, so every change in it stays queued.
   */
  | { status: 'failed'; reason: string; retryable: boolean };

export interface DeviceIdentityRepository {
  /**
   * Returns this installation's stable device id, creating it on first call.
   *
   * Stability is the point: the server distinguishes a retried change from a
   * new one by `(device_id, entity_id, local_version)`
   * (docs/offline-sync.md §7). An id that changed per launch would make every
   * retry look like a fresh change.
   */
  getOrCreateDeviceId(at: string): Promise<string>;
}

export type PullTransportResult =
  | { status: 'ok'; response: SyncPullResponse }
  | { status: 'failed'; reason: string; retryable: boolean };

/**
 * Why a pulled change was not written locally.
 *
 * `local_pending` is the confirmed conflict policy seen from this direction:
 * client-wins (docs/offline-sync.md §8) means an unsent local edit outranks
 * the server's version, so the server's copy is skipped and the local one goes
 * out on the next upload. Nothing is discarded either way.
 */
export type SkipReason = 'local_pending' | 'missing_reference';

export interface AppliedPull {
  applied: number;
  skipped: { entityType: SyncEntityType; entityId: string; reason: SkipReason }[];
}

export interface SyncDownloadRepository {
  /** The cursor of the last fully applied page, or null if never pulled. */
  getPullCursor(): Promise<string | null>;
  /** Stored only after a page is applied, so an interrupted page is re-fetched. */
  setPullCursor(cursor: string, at: string): Promise<void>;

  /** Ids of every site held locally, to keep coordinate-less ones in scope. */
  listKnownSiteIds(): Promise<string[]>;
  /** Bounding boxes of the map regions whose download finished. */
  listDownloadedRegionBounds(): Promise<[number, number, number, number][]>;

  /**
   * Writes one page of server changes into the local database.
   *
   * Must be atomic per page and must never overwrite a record that has an
   * unsent local change — that row is reported in `skipped` instead
   * (docs/offline-sync.md §8). It also writes `sync_records.server_version`
   * for what it applies, so the next upload from this device carries the right
   * `baseServerVersion` and does not read as a conflict.
   */
  applyPulledChanges(changes: PulledChange[], at: string): Promise<AppliedPull>;
}

export interface SyncTransport {
  /**
   * Uploads one batch.
   *
   * Implementations must never throw: a network error is an expected,
   * ordinary condition for this app, not an exception (docs/offline-sync.md
   * §2). It is returned as a `failed` result so the run can record it against
   * the right records and continue.
   */
  push(request: SyncRequest): Promise<TransportResult>;

  /** Reads one page of server changes. Never throws, for the same reason. */
  pull(request: SyncPullRequest): Promise<PullTransportResult>;
}
