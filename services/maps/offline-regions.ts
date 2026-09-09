/**
 * Offline map region downloads (docs/offline-sync.md §12).
 *
 * Uses MapLibre's own `OfflineManager`, which is alternative 2 from
 * docs/maps.md §5 — the one that works with the installed library. `.pmtiles`
 * is not loadable by `@maplibre/maplibre-react-native` 11.3.10, so the
 * Protomaps output is served as tiles by the project's own backend and cached
 * here by MapLibre.
 *
 * This module downloads **map resources only**. It never touches sites or
 * equipment: downloading a region does not download business data
 * (CLAUDE.md §10).
 */
import { OfflineManager } from '@maplibre/maplibre-react-native';

import type { BoundingBox } from '../../features/maps/domain/map-features';
import { basemapConfig, type BasemapConfig } from './tile-source';
import { resolveMapStyle } from './style';

export interface RegionDownloadRequest {
  id: string;
  name: string;
  /** [west, south, east, north] */
  bounds: BoundingBox;
  minZoom?: number;
  maxZoom?: number;
}

export interface RegionProgress {
  /** 0–1. */
  progress: number;
  completed: boolean;
}

export type RegionDownloadOutcome =
  | { status: 'started' }
  | { status: 'unavailable'; reason: 'no_basemap' | 'invalid_style'; detail: string };

/**
 * Zoom range for a field-work region.
 *
 * Below 6 the tiles are a country outline nobody navigates by; above 14 the
 * pack size grows faster than its usefulness for locating a hospital. Both are
 * overridable per request.
 */
export const DEFAULT_MIN_ZOOM = 6;
export const DEFAULT_MAX_ZOOM = 14;

/**
 * Whether downloading a region is possible at all.
 *
 * With no basemap configured there are no tiles to fetch, so offering a
 * download button would promise something that cannot happen.
 */
export function canDownloadRegions(
  config: BasemapConfig = basemapConfig
): RegionDownloadOutcome | { status: 'available' } {
  if (config.mode === 'none') {
    return {
      status: 'unavailable',
      reason: 'no_basemap',
      detail:
        'No hay un estilo de mapa auto-hospedado configurado, así que no hay teselas que descargar.',
    };
  }

  try {
    resolveMapStyle(config);
    return { status: 'available' };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: 'invalid_style',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface OfflineManagerLike {
  createPack(
    options: {
      mapStyle: string;
      bounds: BoundingBox;
      minZoom?: number;
      maxZoom?: number;
      metadata?: Record<string, unknown>;
    },
    onProgress: (pack: unknown, status: { percentage?: number }) => void,
    onError: (pack: unknown, error: { message?: string }) => void
  ): Promise<unknown>;
}

export interface DownloadRegionDeps {
  manager?: OfflineManagerLike;
  config?: BasemapConfig;
  onProgress: (progress: RegionProgress) => void;
  onError: (message: string) => void;
}

/**
 * Starts a region download.
 *
 * Returns as soon as the download is queued; progress and failures arrive
 * through the callbacks, which the caller persists into `map_regions` so the
 * state survives the app being closed mid-download (docs/offline-sync.md §12).
 */
export async function downloadRegion(
  request: RegionDownloadRequest,
  deps: DownloadRegionDeps
): Promise<RegionDownloadOutcome> {
  const config = deps.config ?? basemapConfig;
  const availability = canDownloadRegions(config);
  if (availability.status !== 'available') return availability;

  const style = resolveMapStyle(config);
  if (typeof style !== 'string') {
    // createPack needs a style URL; an inline style has no tiles to fetch.
    return {
      status: 'unavailable',
      reason: 'no_basemap',
      detail: 'El estilo en línea no define teselas descargables.',
    };
  }

  const manager = deps.manager ?? (OfflineManager as unknown as OfflineManagerLike);

  await manager.createPack(
    {
      mapStyle: style,
      bounds: request.bounds,
      minZoom: request.minZoom ?? DEFAULT_MIN_ZOOM,
      maxZoom: request.maxZoom ?? DEFAULT_MAX_ZOOM,
      metadata: { regionId: request.id, name: request.name },
    },
    (_pack, status) => {
      const percentage = status.percentage ?? 0;
      deps.onProgress({
        progress: Math.min(1, Math.max(0, percentage / 100)),
        completed: percentage >= 100,
      });
    },
    (_pack, error) => {
      deps.onError(error.message ?? 'La descarga de la región falló.');
    }
  );

  return { status: 'started' };
}
