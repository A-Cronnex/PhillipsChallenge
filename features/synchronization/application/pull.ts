/**
 * One download run.
 *
 * Kept separate from `runSynchronization` rather than folded into it: the two
 * directions fail independently, and a device with an upload it cannot land
 * must still be able to receive what the server already holds. The caller
 * decides whether to do one, the other, or both (`syncBothDirections`).
 *
 * The cursor is stored **after** a page is applied, never before. An
 * interrupted run therefore re-fetches the page it was in the middle of, which
 * is safe because every write is an upsert keyed on the entity id — applying
 * the same page twice converges to the same rows (docs/offline-sync.md §7).
 */
import { MAX_PULL_CHANGES, type SyncPullRequest } from '../../../types/sync-contract';
import type {
  SkipReason,
  SyncDownloadRepository,
  SyncTransport,
} from './ports';
import type { SyncEntityType } from '../../../types/domain';

/**
 * How many pages one run will fetch.
 *
 * The same reasoning as `MAX_CHANGES_PER_RUN` on the upload side: a device
 * returning from a long offline stretch does a bounded amount of work, and
 * what is left waits for the next run. The cursor makes stopping early free.
 */
export const MAX_PULL_PAGES_PER_RUN = 10;

export interface PullSkip {
  entityType: SyncEntityType;
  entityId: string;
  reason: SkipReason;
}

export interface PullRunReport {
  status:
    /** No sync server is configured, so the run did nothing at all. */
    | 'not_configured'
    | 'completed'
    | 'transport_failed';
  /** Records written into the local database. */
  applied: number;
  /**
   * Records the server sent that were not written.
   *
   * `local_pending` is not an error: it is client-wins working
   * (docs/offline-sync.md §8). Surfaced so the user can see that their own
   * unsent edit is why a server update did not appear.
   */
  skipped: PullSkip[];
  pages: number;
  /** True when the server still has changes past where this run stopped. */
  moreAvailable: boolean;
  transportError: string | null;
}

export interface PullDeps {
  downloads: SyncDownloadRepository;
  /** `null` when no sync server is configured (services/sync/config.ts). */
  transport: Pick<SyncTransport, 'pull'> | null;
  deviceId: string;
  now: () => Date;
  maxPages?: number;
  pageSize?: number;
}

export async function runPull(deps: PullDeps): Promise<PullRunReport> {
  const report: PullRunReport = {
    status: 'completed', applied: 0, skipped: [], pages: 0,
    moreAvailable: false, transportError: null,
  };

  if (deps.transport === null) {
    report.status = 'not_configured';
    return report;
  }

  const timestamp = () => deps.now().toISOString();

  // Scope is recomputed every run, not cached: the user may have downloaded a
  // new map region since the last one, and that is exactly the event that
  // should widen what this device receives (docs/maps.md §15).
  const [knownSiteIds, regionBounds] = await Promise.all([
    deps.downloads.listKnownSiteIds(),
    deps.downloads.listDownloadedRegionBounds(),
  ]);

  let cursor = await deps.downloads.getPullCursor();
  const maxPages = deps.maxPages ?? MAX_PULL_PAGES_PER_RUN;

  for (let page = 0; page < maxPages; page += 1) {
    const request: SyncPullRequest = {
      deviceId: deps.deviceId,
      clientTime: timestamp(),
      cursor,
      regions: regionBounds.map((bounds) => ({ bounds })),
      knownSiteIds,
      limit: deps.pageSize ?? MAX_PULL_CHANGES,
    };

    const result = await deps.transport.pull(request);

    if (result.status === 'failed') {
      // Nothing is written and the cursor is untouched, so the next run
      // resumes from exactly here.
      report.status = 'transport_failed';
      report.transportError = result.reason;
      return report;
    }

    const { changes, cursor: nextCursor, hasMore } = result.response;
    report.pages += 1;

    if (changes.length > 0) {
      const applied = await deps.downloads.applyPulledChanges(changes, timestamp());
      report.applied += applied.applied;
      report.skipped.push(...applied.skipped);
    }

    // Advance even when every change in the page was skipped: they were
    // delivered and decided upon. Not advancing would re-fetch the same page
    // on every future run and never reach the changes behind it.
    if (nextCursor !== cursor) {
      await deps.downloads.setPullCursor(nextCursor, timestamp());
      cursor = nextCursor;
    }

    if (!hasMore) return report;
    report.moreAvailable = true;
  }

  return report;
}
