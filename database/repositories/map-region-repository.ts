import type * as SQLite from 'expo-sqlite';

import type {
  MapRegion,
  MapRegionRepository,
} from '../../features/maps/application/ports';
import type { MapRegionStatus } from '../../types/domain';

interface MapRegionRow {
  id: string;
  name: string;
  min_latitude: number;
  max_latitude: number;
  min_longitude: number;
  max_longitude: number;
  download_status: MapRegionStatus;
  download_progress: number;
  last_error: string | null;
  size_bytes: number | null;
  downloaded_at: string | null;
}

/**
 * Reads the local map cache state.
 *
 * Separate from the business-data repository on purpose: a downloaded region
 * says nothing about which sites are available offline, and vice versa
 * (CLAUDE.md §10, docs/offline-sync.md §11).
 */
export function createMapRegionRepository(
  db: SQLite.SQLiteDatabase
): MapRegionRepository {
  return {
    async listRegions(): Promise<MapRegion[]> {
      const rows = await db.getAllAsync<MapRegionRow>(
        `SELECT id, name, min_latitude, max_latitude, min_longitude,
                max_longitude, download_status, download_progress, last_error,
                size_bytes, downloaded_at
           FROM map_regions
          ORDER BY name ASC`
      );

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        // MapLibre order: [west, south, east, north].
        bounds: [
          row.min_longitude,
          row.min_latitude,
          row.max_longitude,
          row.max_latitude,
        ],
        status: row.download_status,
        progress: row.download_progress,
        lastError: row.last_error,
        sizeBytes: row.size_bytes,
        downloadedAt: row.downloaded_at,
      }));
    },

    async upsertRegion(region): Promise<void> {
      const now = new Date().toISOString();
      // INSERT ... ON CONFLICT so re-downloading a region updates the existing
      // row instead of failing on the primary key or creating a duplicate.
      await db.runAsync(
        `INSERT INTO map_regions (
           id, name, min_latitude, max_latitude, min_longitude, max_longitude,
           download_status, download_progress, last_error, size_bytes,
           downloaded_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           name = excluded.name,
           min_latitude = excluded.min_latitude,
           max_latitude = excluded.max_latitude,
           min_longitude = excluded.min_longitude,
           max_longitude = excluded.max_longitude,
           download_status = excluded.download_status,
           download_progress = excluded.download_progress,
           last_error = excluded.last_error,
           size_bytes = excluded.size_bytes,
           downloaded_at = excluded.downloaded_at,
           updated_at = excluded.updated_at`,
        [
          region.id,
          region.name,
          // bounds are [west, south, east, north]; the columns are lat/lon.
          region.bounds[1],
          region.bounds[3],
          region.bounds[0],
          region.bounds[2],
          region.status,
          region.progress,
          region.lastError,
          region.sizeBytes,
          region.downloadedAt,
          now,
          now,
        ]
      );
    },

    async updateRegionStatus(id, update): Promise<void> {
      await db.runAsync(
        `UPDATE map_regions
            SET download_status = ?,
                download_progress = ?,
                last_error = ?,
                size_bytes = COALESCE(?, size_bytes),
                downloaded_at = COALESCE(?, downloaded_at),
                updated_at = ?
          WHERE id = ?`,
        [
          update.status,
          update.progress,
          update.lastError ?? null,
          update.sizeBytes ?? null,
          update.downloadedAt ?? null,
          new Date().toISOString(),
          id,
        ]
      );
    },
  };
}
