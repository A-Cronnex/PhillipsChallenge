/**
 * Ports the map screen depends on.
 *
 * Business data and map cache state are read through two separate interfaces,
 * because they are two separate concerns: downloading a map region does not
 * download business data, and having business data does not imply a basemap is
 * available (CLAUDE.md §10, docs/offline-sync.md §11).
 */
import type { MapRegionStatus } from '../../../types/domain';
import type { BoundingBox, MapDataset } from '../domain/map-features';

/** Reads locally stored sites and equipment for display on the map. */
export interface MapDataRepository {
  /**
   * Every locally stored site with its equipment. Never performs a network
   * call — the map must work with no connectivity.
   *
   * Includes sites without coordinates so the caller can report them rather
   * than have them disappear.
   */
  loadMapDataset(): Promise<MapDataset>;
}

/** Local cache state of an offline map region. Not business data. */
export interface MapRegion {
  id: string;
  name: string;
  bounds: BoundingBox;
  status: MapRegionStatus;
  /** 0–1. */
  progress: number;
  lastError: string | null;
  sizeBytes: number | null;
  downloadedAt: string | null;
}

export interface MapRegionRepository {
  listRegions(): Promise<MapRegion[]>;
  /**
   * Creates or replaces a region row.
   *
   * Called before the download starts, so a download interrupted by the app
   * closing leaves a row in `downloading` rather than no trace at all
   * (docs/offline-sync.md §12).
   */
  upsertRegion(region: MapRegion): Promise<void>;
  /** Records progress, completion or failure of an in-flight download. */
  updateRegionStatus(
    id: string,
    update: {
      status: MapRegionStatus;
      progress: number;
      lastError?: string | null;
      sizeBytes?: number | null;
      downloadedAt?: string | null;
    }
  ): Promise<void>;
}
