/**
 * One page of the download direction.
 *
 * Deliberately thin: the scope is decided by validation, the ordering and
 * filtering by the store's SQL, so what is left here is the contract shape and
 * the clock. Keeping it this small is what makes the pull testable against a
 * fake store without a database.
 *
 * There is no conflict handling on this side. Under client-wins
 * (docs/offline-sync.md §8) the server always reports what it holds, and the
 * device decides whether to apply it — a record with an unsent local edit is
 * skipped there, not here (features/synchronization/application/pull.ts).
 */
import type { SyncPullResponse } from '../../../types/sync-contract';
import type { PullScope, SyncPullStore } from './ports';

export interface PullServiceDeps {
  pullStore: SyncPullStore;
  now: () => Date;
}

export async function readPullPage(
  cursor: string | null,
  scope: PullScope,
  limit: number,
  deps: PullServiceDeps
): Promise<SyncPullResponse> {
  const page = await deps.pullStore.readChanges(cursor, scope, limit);
  return {
    serverTime: deps.now().toISOString(),
    changes: page.changes,
    cursor: page.cursor,
    hasMore: page.hasMore,
  };
}
