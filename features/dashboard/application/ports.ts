/**
 * Ports the dashboard depends on.
 *
 * Two separate interfaces on purpose. Business data and synchronization state
 * are different concerns, and the dashboard is allowed to *display* sync
 * status but must not own it (docs/architecture.md §10). Keeping them apart
 * also makes it structurally impossible for a metric to be filtered by sync
 * state: `DashboardRepository` never sees `sync_records`.
 */
import type { SyncStatus } from '../../../types/domain';
import type { ObservationFact } from '../domain/metrics';

export interface DashboardRepository {
  /**
   * Every locally stored observation, reduced to the columns the metrics
   * need. Never performs a network call, and never filters by
   * synchronization state — a record that has never left the device counts
   * (docs/offline-sync.md §2).
   */
  loadObservationFacts(): Promise<ObservationFact[]>;
}

export interface SyncStateCounts {
  byStatus: Record<SyncStatus, number>;
  total: number;
}

export interface SyncStateRepository {
  /**
   * How many local records sit in each synchronization state, across every
   * entity type. Context shown beside the metrics, never mixed into them.
   */
  countByStatus(): Promise<SyncStateCounts>;
}
