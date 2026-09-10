/**
 * Populates `map_regions` with the app's fixed region catalog, so the map
 * screen can offer "Descargar" for Brazil, Panamá, Sao Paulo and Ciudad de
 * Panamá before any of them has ever been downloaded.
 *
 * Idempotent: only ids missing from the table are inserted, so re-running
 * this on every app start never resets a region that finished downloading
 * (or is mid-download) back to `not_downloaded`.
 */
import { PREDEFINED_REGIONS } from '../domain/predefined-regions';
import type { MapRegionRepository } from './ports';

export async function seedPredefinedRegions(
  mapRegions: MapRegionRepository
): Promise<void> {
  const existingIds = new Set((await mapRegions.listRegions()).map((region) => region.id));

  for (const region of PREDEFINED_REGIONS) {
    if (existingIds.has(region.id)) continue;
    await mapRegions.upsertRegion({
      id: region.id,
      name: region.name,
      bounds: region.bounds,
      status: 'not_downloaded',
      progress: 0,
      lastError: null,
      sizeBytes: null,
      downloadedAt: null,
    });
  }
}
