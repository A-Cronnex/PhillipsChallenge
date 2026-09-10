import type * as SQLite from 'expo-sqlite';

import type {
  SiteRepository,
  SiteSummary,
} from '../../features/sites/application/ports';

interface SiteRow {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
}

/**
 * SQLite implementation of the site read port.
 *
 * Reads only locally stored rows and never contacts the network, so the site
 * picker works with no connectivity (docs/offline-sync.md §2).
 */
export function createSiteRepository(
  db: SQLite.SQLiteDatabase
): SiteRepository {
  return {
    async listSites(): Promise<SiteSummary[]> {
      // Uses idx_sites_name from migration 001.
      const rows = await db.getAllAsync<SiteRow>(
        `SELECT id, name, city, country FROM sites ORDER BY name ASC`
      );
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        city: row.city,
        country: row.country,
      }));
    },

    async getSite(siteId: string): Promise<SiteSummary | null> {
      const row = await db.getFirstAsync<SiteRow>(
        `SELECT id, name, city, country FROM sites WHERE id = ?`,
        [siteId]
      );
      if (!row) return null;
      return { id: row.id, name: row.name, city: row.city, country: row.country };
    },
  };
}
