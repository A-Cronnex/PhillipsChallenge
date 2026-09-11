/**
 * Ports the sync service depends on.
 *
 * Same rule as on the device (CLAUDE.md §5): the application layer talks to
 * interfaces, and `pg` appears only in server/src/infrastructure/.
 */
import type { SyncEntityType } from '../../../types/domain';
import type { EntitySyncState, SyncDecision } from '../domain/conflict';
import type { ValidatedChange } from '../validation/validate-change';

export interface ApplyContext {
  deviceId: string;
  receivedAt: string;
}

export type ApplyOutcome =
  | { status: 'ok'; decision: SyncDecision }
  /**
   * A foreign key the change points at does not exist here — most often an
   * observation whose site has not been uploaded yet, or a user that this
   * server has never been told about. Retryable once the referenced record
   * arrives, so the client keeps the change instead of discarding it.
   */
  | { status: 'missing_reference'; detail: string }
  /**
   * The central schema refused the value itself — a CHECK constraint, a bad
   * cast, a duplicate key. Not retryable: the same payload will be refused
   * again, so the client must surface it rather than loop. Reaching this means
   * server/src/validation missed a rule the database enforces, which is the
   * backstop working as intended.
   */
  | { status: 'constraint_violation'; detail: string }
  /** Anything else the database refused. Retryable. */
  | { status: 'storage_error'; detail: string };

export interface SyncStore {
  /**
   * Applies one change atomically.
   *
   * `decide` is called with the entity's current sync state **while that state
   * is locked**, and the implementation must honour whatever it returns
   * within the same transaction. The decision is passed in rather than made
   * here so that the client-wins rule stays one pure, exhaustively tested
   * function (server/src/domain/conflict.ts) instead of being reimplemented
   * inside SQL — but it has to be evaluated under the lock, or two devices
   * syncing the same entity at once would both compute the same next version.
   *
   * The implementation is responsible for archiving the replaced state when
   * the decision reports an overwrite: docs/offline-sync.md §11 forbids
   * resolving a conflict by silently discarding data, and client-wins
   * requires the overwrite, so the replaced state has to be kept.
   */
  applyChange(
    change: ValidatedChange,
    context: ApplyContext,
    decide: (current: EntitySyncState | null) => SyncDecision
  ): Promise<ApplyOutcome>;
}

export interface SyncServiceDeps {
  store: SyncStore;
  /** Injected so responses are deterministic in tests. */
  now: () => Date;
}

export interface EntityRef {
  entityType: SyncEntityType;
  entityId: string;
}

// ---------------------------------------------------------------------------
// Download (pull) direction
// ---------------------------------------------------------------------------

/**
 * The scope one device is entitled to receive, already validated.
 *
 * Resolved from the request rather than from server-side state because the
 * subset a field device needs is the places whose map it downloaded, and only
 * the device knows that (docs/maps.md §15, docs/offline-sync.md §10).
 */
export interface PullScope {
  /** Bounding boxes, in [west, south, east, north] order. */
  regions: { west: number; south: number; east: number; north: number }[];
  /** Sites the device already holds, so coordinate-less ones stay updated. */
  knownSiteIds: string[];
  /** Conversations are scoped by their owner, not by place. */
  userId: string;
}

export interface PullPage {
  changes: import('../../../types/sync-contract').PulledChange[];
  /** Highest `change_seq` in this page, or the incoming cursor when empty. */
  cursor: string;
  hasMore: boolean;
}

export interface SyncPullStore {
  /**
   * Reads one page of changes at or after `cursor`, restricted to `scope`.
   *
   * Ordered by the global change sequence so applying the pages in order
   * converges, and so re-sending the same cursor returns the same page
   * (server/migrations/002_pull_cursor.sql).
   */
  readChanges(cursor: string | null, scope: PullScope, limit: number): Promise<PullPage>;
}
