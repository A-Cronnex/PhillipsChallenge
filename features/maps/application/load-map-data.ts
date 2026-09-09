/**
 * Application service for the map screen.
 *
 * Loads business data and map cache state, keeping them separate all the way
 * to the UI so the screen can say "you have 12 sites but no downloaded map"
 * rather than conflating the two (CLAUDE.md §10).
 */
import {
  boundsOf,
  centerOf,
  type BoundingBox,
  type Coordinates,
  type MapDataset,
} from '../domain/map-features';
import type {
  MapDataRepository,
  MapRegion,
  MapRegionRepository,
} from './ports';

export interface MapViewData {
  dataset: MapDataset;
  regions: MapRegion[];
  /** Extent of the mapped sites, or null when none can be placed. */
  bounds: BoundingBox | null;
  /** Where to point the camera initially, or null when there is nothing to show. */
  center: Coordinates | null;
}

export type LoadMapDataOutcome =
  | { status: 'loaded'; data: MapViewData }
  | { status: 'failed'; reason: string };

export interface LoadMapDataDeps {
  mapData: MapDataRepository;
  mapRegions: MapRegionRepository;
}

export async function loadMapData(
  deps: LoadMapDataDeps
): Promise<LoadMapDataOutcome> {
  try {
    // Both reads are local, so running them together costs nothing and keeps
    // the screen from rendering business data before it knows the cache state.
    const [dataset, regions] = await Promise.all([
      deps.mapData.loadMapDataset(),
      deps.mapRegions.listRegions(),
    ]);

    const bounds = boundsOf(dataset.sites);

    return {
      status: 'loaded',
      data: {
        dataset,
        regions,
        bounds,
        center: bounds ? centerOf(bounds) : null,
      },
    };
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
