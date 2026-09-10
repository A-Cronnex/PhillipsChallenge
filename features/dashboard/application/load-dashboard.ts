/**
 * Application service for the dashboard.
 *
 * Reads local rows, computes the metrics, and reports failure instead of
 * throwing — the screen has an error state and a retry, and a dashboard that
 * crashes takes the rest of the tab with it.
 *
 * Nothing here waits on the network. The dashboard renders whatever is on the
 * device, which is the whole point: it must be useful before a backend exists
 * at all (CLAUDE.md §6, docs/tech-stack.md §5).
 */
import {
  computeDashboardMetrics,
  type DashboardMetrics,
} from '../domain/metrics';
import type {
  DashboardRepository,
  SyncStateCounts,
  SyncStateRepository,
} from './ports';

export interface DashboardData {
  metrics: DashboardMetrics;
  /**
   * Synchronization state of local records. Separate from `metrics` all the
   * way to the screen so the UI cannot accidentally present "12 pending" as
   * if it were a business number (docs/architecture.md §10).
   */
  sync: SyncStateCounts | null;
  /** The date the metrics were computed against, `YYYY-MM-DD`. */
  computedFor: string;
}

export type LoadDashboardOutcome =
  | { status: 'loaded'; data: DashboardData }
  | { status: 'failed'; reason: string };

export interface LoadDashboardDeps {
  dashboard: DashboardRepository;
  syncState: SyncStateRepository;
  /** Injected for determinism in tests, as elsewhere in the capture flow. */
  now: () => Date;
}

/** `YYYY-MM-DD` in UTC, matching docs/database.md §17.1. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function loadDashboard(
  deps: LoadDashboardDeps
): Promise<LoadDashboardOutcome> {
  const today = toIsoDate(deps.now());

  let facts;
  try {
    facts = await deps.dashboard.loadObservationFacts();
  } catch (error) {
    return { status: 'failed', reason: describe(error) };
  }

  // The sync panel is context, not content. If reading `sync_records` fails,
  // the metrics are still correct and still worth showing, so the failure
  // degrades that one panel instead of the screen (CLAUDE.md §6: local data
  // must not be withheld because something else was unavailable).
  let sync: SyncStateCounts | null = null;
  try {
    sync = await deps.syncState.countByStatus();
  } catch {
    sync = null;
  }

  return {
    status: 'loaded',
    data: {
      metrics: computeDashboardMetrics(facts, today),
      sync,
      computedFor: today,
    },
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
