import type * as SQLite from 'expo-sqlite';

import type {
  DashboardRepository,
  SyncStateCounts,
  SyncStateRepository,
} from '../../features/dashboard/application/ports';
import type { ObservationFact } from '../../features/dashboard/domain/metrics';
import { SYNC_STATUSES, type SyncStatus } from '../../types/domain';

interface ObservationFactRow {
  id: string;
  site_id: string;
  site_name: string;
  country: string | null;
  city: string | null;
  visit_date: string;
  quantity: number | null;
  brand: string | null;
  model: string | null;
  modality: string | null;
  estimated_years_of_use: number | null;
  estimated_installation_year: number | null;
  overall_confidence: string | null;
}

interface SyncCountRow {
  sync_status: string;
  total: number;
}

const CONFIDENCE_VALUES = new Set<string>(['high', 'medium', 'low']);

/**
 * Reads the rows the dashboard aggregates.
 *
 * Local reads only — no network call anywhere in this file, so the dashboard
 * works with connectivity unavailable (docs/offline-sync.md §2).
 *
 * Two things this query deliberately does not do:
 *
 * - It does not join `sync_records`. Metrics must not vary with
 *   synchronization state, and the surest way to guarantee that is for the
 *   query that feeds them to be unable to see it (docs/architecture.md §10).
 * - It does not read `equipment`. The installed base a device knows about
 *   today is what was observed; `equipment` rows are created by
 *   synchronization or by duplicate detection, neither of which exists yet
 *   (docs/ai-agent-implementation.md §8.1). Aggregating that table would show
 *   an empty dashboard to a user who captured all day.
 *
 * It also does not select `notes`: free text has no place in an aggregate and
 * reading it here would pull the user's own words about a hospital into memory
 * for nothing (CLAUDE.md §15).
 */
export function createDashboardRepository(
  db: SQLite.SQLiteDatabase
): DashboardRepository {
  return {
    async loadObservationFacts(): Promise<ObservationFact[]> {
      // INNER JOIN: `observations.site_id` is NOT NULL and references sites,
      // so an observation without a site cannot exist. Ordered by visit date
      // so the rows arrive in a stable order for anything that samples them.
      // Uses idx_observations_site_id.
      const rows = await db.getAllAsync<ObservationFactRow>(
        `SELECT o.id,
                o.site_id,
                s.name AS site_name,
                s.country,
                s.city,
                o.visit_date,
                o.quantity,
                o.brand,
                o.model,
                o.modality,
                o.estimated_years_of_use,
                o.estimated_installation_year,
                o.overall_confidence
           FROM observations o
           JOIN sites s ON s.id = o.site_id
          ORDER BY o.visit_date DESC, o.id ASC`
      );

      return rows.map((row) => ({
        observationId: row.id,
        siteId: row.site_id,
        siteName: row.site_name,
        country: row.country,
        city: row.city,
        visitDate: row.visit_date,
        quantity: row.quantity,
        brand: row.brand,
        model: row.model,
        modality: row.modality,
        estimatedYearsOfUse: row.estimated_years_of_use,
        estimatedInstallationYear: row.estimated_installation_year,
        // A CHECK constraint already restricts this column, but a row could
        // predate a constraint or arrive from a future sync. An unrecognised
        // value becomes `null` — counted as unrated, never as a level it is
        // not (CLAUDE.md §7).
        overallConfidence:
          row.overall_confidence !== null &&
          CONFIDENCE_VALUES.has(row.overall_confidence)
            ? (row.overall_confidence as ObservationFact['overallConfidence'])
            : null,
      }));
    },
  };
}

/**
 * Counts local records by synchronization state.
 *
 * Separate from the metrics repository because it answers a different
 * question, and because the dashboard displays synchronization status without
 * owning it (docs/architecture.md §10).
 */
export function createSyncStateRepository(
  db: SQLite.SQLiteDatabase
): SyncStateRepository {
  return {
    async countByStatus(): Promise<SyncStateCounts> {
      // Uses idx_sync_records_sync_status.
      const rows = await db.getAllAsync<SyncCountRow>(
        `SELECT sync_status, COUNT(*) AS total
           FROM sync_records
          GROUP BY sync_status`
      );

      // Every state is present with a zero, so the UI can render the full set
      // from docs/offline-sync.md §4 without inventing missing keys.
      const byStatus = Object.fromEntries(
        SYNC_STATUSES.map((status) => [status, 0])
      ) as Record<SyncStatus, number>;

      let total = 0;
      for (const row of rows) {
        if (!(row.sync_status in byStatus)) continue;
        byStatus[row.sync_status as SyncStatus] = row.total;
        total += row.total;
      }

      return { byStatus, total };
    },
  };
}
