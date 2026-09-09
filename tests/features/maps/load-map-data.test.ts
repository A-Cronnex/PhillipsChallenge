import { loadMapData } from '../../../features/maps/application/load-map-data';
import type {
  MapDataRepository,
  MapRegion,
  MapRegionRepository,
} from '../../../features/maps/application/ports';
import type { MapDataset } from '../../../features/maps/domain/map-features';

const emptyDataset: MapDataset = {
  sites: [],
  equipment: [],
  unmappableSites: [],
};

function datasetWith(overrides: Partial<MapDataset> = {}): MapDataset {
  return { ...emptyDataset, ...overrides };
}

function deps(options: {
  dataset?: MapDataset;
  regions?: MapRegion[];
  dataError?: Error;
  regionError?: Error;
}) {
  const mapData: MapDataRepository = {
    async loadMapDataset() {
      if (options.dataError) throw options.dataError;
      return options.dataset ?? emptyDataset;
    },
  };
  const mapRegions: MapRegionRepository = {
    async listRegions() {
      if (options.regionError) throw options.regionError;
      return options.regions ?? [];
    },
    // Loading the map never writes region state.
    async upsertRegion() {
      throw new Error('loadMapData must not write regions');
    },
    async updateRegionStatus() {
      throw new Error('loadMapData must not write regions');
    },
  };
  return { mapData, mapRegions };
}

const site = {
  siteId: 'site-1',
  name: 'Hospital Example',
  city: 'Panama City',
  country: 'Panama',
  coordinates: { longitude: -79.52, latitude: 8.98 },
  equipmentCount: 0,
  equipmentUnitCount: 0,
  modalities: [],
};

describe('loadMapData', () => {
  it('loads business data and map cache state together', async () => {
    const regions: MapRegion[] = [
      {
        id: 'region-1',
        name: 'Panama',
        bounds: [-83, 7, -77, 10],
        status: 'downloaded',
        progress: 1,
        lastError: null,
        sizeBytes: 1024,
        downloadedAt: '2026-09-09T14:48:00.000Z',
      },
    ];

    const outcome = await loadMapData(
      deps({ dataset: datasetWith({ sites: [site] }), regions })
    );

    expect(outcome.status).toBe('loaded');
    if (outcome.status !== 'loaded') return;
    expect(outcome.data.dataset.sites).toHaveLength(1);
    expect(outcome.data.regions).toHaveLength(1);
  });

  it('keeps business data and map cache state as separate fields', async () => {
    // CLAUDE.md §10: having sites says nothing about having a downloaded map.
    const outcome = await loadMapData(
      deps({ dataset: datasetWith({ sites: [site] }), regions: [] })
    );

    expect(outcome.status).toBe('loaded');
    if (outcome.status !== 'loaded') return;
    expect(outcome.data.dataset.sites).toHaveLength(1);
    expect(outcome.data.regions).toEqual([]);
  });

  it('computes bounds and centre from the mapped sites', async () => {
    const outcome = await loadMapData(
      deps({
        dataset: datasetWith({
          sites: [
            { ...site, siteId: 'a', coordinates: { longitude: -82, latitude: 7 } },
            { ...site, siteId: 'b', coordinates: { longitude: -78, latitude: 11 } },
          ],
        }),
      })
    );

    expect(outcome.status).toBe('loaded');
    if (outcome.status !== 'loaded') return;
    expect(outcome.data.bounds).toEqual([-82, 7, -78, 11]);
    expect(outcome.data.center).toEqual({ longitude: -80, latitude: 9 });
  });

  it('reports no bounds when nothing can be placed', async () => {
    const outcome = await loadMapData(deps({}));

    expect(outcome.status).toBe('loaded');
    if (outcome.status !== 'loaded') return;
    expect(outcome.data.bounds).toBeNull();
    expect(outcome.data.center).toBeNull();
  });

  it('preserves sites that cannot be placed instead of dropping them', async () => {
    const outcome = await loadMapData(
      deps({
        dataset: datasetWith({
          unmappableSites: [
            { siteId: 'x', name: 'Clínica Sin Coordenadas', reason: 'missing_coordinates' },
          ],
        }),
      })
    );

    expect(outcome.status).toBe('loaded');
    if (outcome.status !== 'loaded') return;
    expect(outcome.data.dataset.unmappableSites).toHaveLength(1);
  });

  it('reports a business-data read failure instead of throwing', async () => {
    const outcome = await loadMapData(deps({ dataError: new Error('db locked') }));

    expect(outcome.status).toBe('failed');
    expect(outcome.status === 'failed' && outcome.reason).toContain('db locked');
  });

  it('reports a map cache read failure instead of throwing', async () => {
    const outcome = await loadMapData(
      deps({ regionError: new Error('map_regions missing') })
    );

    expect(outcome.status).toBe('failed');
  });
});
