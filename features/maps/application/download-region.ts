/**
 * Starts a download for one of the app's predefined regions and keeps
 * `map_regions` in step with it.
 *
 * Thin on purpose: `services/maps/offline-regions.ts` already does the real
 * work (talks to MapLibre's `OfflineManager`); this file's only job is to
 * write the row *before* the download starts (docs/offline-sync.md §12 — an
 * interrupted download must leave a trace, not silently vanish) and to
 * translate its progress/error callbacks into `updateRegionStatus` calls.
 */
import {
  downloadRegion as downloadRegionService,
  type DownloadRegionDeps as ServiceDeps,
} from '../../../services/maps/offline-regions';
import type { PredefinedRegion } from '../domain/predefined-regions';
import type { MapRegionRepository } from './ports';

export interface StartRegionDownloadDeps {
  mapRegions: MapRegionRepository;
  /** Test seam for `services/maps/offline-regions.ts`'s own OfflineManager dependency. */
  manager?: ServiceDeps['manager'];
  /** Test seam for the basemap config the service checks (defaults to the app's real `basemapConfig`). */
  config?: ServiceDeps['config'];
  now?: () => Date;
}

export async function startRegionDownload(
  region: PredefinedRegion,
  deps: StartRegionDownloadDeps
): Promise<void> {
  const now = deps.now ?? (() => new Date());

  await deps.mapRegions.upsertRegion({
    id: region.id,
    name: region.name,
    bounds: region.bounds,
    status: 'downloading',
    progress: 0,
    lastError: null,
    sizeBytes: null,
    downloadedAt: null,
  });

  const outcome = await downloadRegionService(
    {
      id: region.id,
      name: region.name,
      bounds: region.bounds,
      minZoom: region.minZoom,
      maxZoom: region.maxZoom,
    },
    {
      manager: deps.manager,
      config: deps.config,
      onProgress: (progress) => {
        void deps.mapRegions.updateRegionStatus(region.id, {
          status: progress.completed ? 'downloaded' : 'downloading',
          progress: progress.progress,
          downloadedAt: progress.completed ? now().toISOString() : null,
        });
      },
      onError: (message) => {
        void deps.mapRegions.updateRegionStatus(region.id, {
          status: 'failed',
          progress: 0,
          lastError: message,
        });
      },
    }
  );

  if (outcome.status === 'unavailable') {
    await deps.mapRegions.updateRegionStatus(region.id, {
      status: 'failed',
      progress: 0,
      lastError: outcome.detail,
    });
  }
}
