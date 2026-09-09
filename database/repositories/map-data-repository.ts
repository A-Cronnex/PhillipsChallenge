import type * as SQLite from 'expo-sqlite';

import type { MapDataRepository } from '../../features/maps/application/ports';
import {
  isValidCoordinates,
  type MapDataset,
  type MappedEquipment,
  type MappedSite,
  type UnmappableSite,
} from '../../features/maps/domain/map-features';

interface SiteRow {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  equipment_count: number;
  equipment_unit_count: number;
  modalities: string | null;
}

interface EquipmentRow {
  id: string;
  site_id: string;
  brand: string | null;
  model: string | null;
  modality: string | null;
  quantity: number | null;
  installation_year: number | null;
  latitude: number;
  longitude: number;
}

/**
 * Reads sites and equipment for the map.
 *
 * Local reads only — no network call anywhere in this file, so the map works
 * with connectivity unavailable (docs/offline-sync.md §2).
 */
export function createMapDataRepository(
  db: SQLite.SQLiteDatabase
): MapDataRepository {
  return {
    async loadMapDataset(): Promise<MapDataset> {
      // Every site, including those with no coordinates: the caller reports
      // them instead of letting them vanish from the screen (CLAUDE.md §6).
      // LEFT JOIN so a site with no equipment still appears, with a count of 0.
      // A record with unknown quantity counts as 1 — it is one real equipment
      // record whose size is unclear, and treating it as 0 would understate
      // what the field user recorded.
      //
      // The CASE is load-bearing: with a LEFT JOIN, a site with no equipment
      // still yields one row whose e.quantity is NULL, and a bare
      // COALESCE(e.quantity, 1) would count that phantom row as one unit. The
      // e.id IS NULL test distinguishes "no equipment" from "equipment of
      // unknown quantity", which COALESCE alone cannot.
      const siteRows = await db.getAllAsync<SiteRow>(
        `SELECT s.id,
                s.name,
                s.city,
                s.country,
                s.latitude,
                s.longitude,
                COUNT(e.id) AS equipment_count,
                COALESCE(SUM(CASE WHEN e.id IS NULL
                                  THEN 0
                                  ELSE COALESCE(e.quantity, 1)
                             END), 0) AS equipment_unit_count,
                GROUP_CONCAT(DISTINCT e.modality) AS modalities
           FROM sites s
           LEFT JOIN equipment e ON e.site_id = s.id
          GROUP BY s.id
          ORDER BY s.name ASC`
      );

      const sites: MappedSite[] = [];
      const unmappableSites: UnmappableSite[] = [];

      for (const row of siteRows) {
        if (row.latitude === null || row.longitude === null) {
          unmappableSites.push({
            siteId: row.id,
            name: row.name,
            reason: 'missing_coordinates',
          });
          continue;
        }

        const coordinates = {
          latitude: row.latitude,
          longitude: row.longitude,
        };

        // The database CHECK constraints already bound these, but a row could
        // predate a constraint or arrive from a future sync; drawing a point at
        // a nonsense coordinate is worse than reporting it.
        if (!isValidCoordinates(coordinates)) {
          unmappableSites.push({
            siteId: row.id,
            name: row.name,
            reason: 'invalid_coordinates',
          });
          continue;
        }

        sites.push({
          siteId: row.id,
          name: row.name,
          city: row.city,
          country: row.country,
          coordinates,
          equipmentCount: row.equipment_count,
          equipmentUnitCount: row.equipment_unit_count,
          modalities: row.modalities
            ? row.modalities.split(',').filter((value) => value.length > 0)
            : [],
        });
      }

      // Equipment has no coordinates of its own (docs/domain-model.md §5), so
      // it is positioned at its site and only equipment at a mappable site can
      // be drawn. Uses idx_equipment_site_id.
      const equipmentRows = await db.getAllAsync<EquipmentRow>(
        `SELECT e.id,
                e.site_id,
                e.brand,
                e.model,
                e.modality,
                e.quantity,
                e.installation_year,
                s.latitude,
                s.longitude
           FROM equipment e
           JOIN sites s ON s.id = e.site_id
          WHERE s.latitude IS NOT NULL
            AND s.longitude IS NOT NULL
          ORDER BY e.brand ASC, e.model ASC`
      );

      const equipment: MappedEquipment[] = equipmentRows.map((row) => ({
        equipmentId: row.id,
        siteId: row.site_id,
        brand: row.brand,
        model: row.model,
        modality: row.modality,
        quantity: row.quantity,
        installationYear: row.installation_year,
        coordinates: { latitude: row.latitude, longitude: row.longitude },
        // Derived from the site, never measured on the equipment itself.
        positionSource: 'site',
      }));

      return { sites, equipment, unmappableSites };
    },
  };
}
