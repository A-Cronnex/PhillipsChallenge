import { seedPredefinedRegions } from '../../../features/maps/application/seed-predefined-regions';
import { PREDEFINED_REGIONS } from '../../../features/maps/domain/predefined-regions';
import type { MapRegion, MapRegionRepository } from '../../../features/maps/application/ports';

function fakeMapRegions(initial: MapRegion[] = []) {
  const rows = new Map(initial.map((region) => [region.id, region]));
  const repository: MapRegionRepository = {
    async listRegions() {
      return [...rows.values()];
    },
    async upsertRegion(region) {
      rows.set(region.id, region);
    },
    async updateRegionStatus() {
      throw new Error('not used by this seed step');
    },
  };
  return { repository, rows };
}

describe('seedPredefinedRegions', () => {
  it('inserts every predefined region as not_downloaded on a fresh table', async () => {
    const { repository, rows } = fakeMapRegions();

    await seedPredefinedRegions(repository);

    expect(rows.size).toBe(PREDEFINED_REGIONS.length);
    for (const region of PREDEFINED_REGIONS) {
      expect(rows.get(region.id)).toMatchObject({
        name: region.name,
        bounds: region.bounds,
        status: 'not_downloaded',
        progress: 0,
      });
    }
  });

  it('never overwrites a region that already exists, downloaded or not', async () => {
    const already: MapRegion = {
      id: PREDEFINED_REGIONS[0].id,
      name: PREDEFINED_REGIONS[0].name,
      bounds: PREDEFINED_REGIONS[0].bounds,
      status: 'downloaded',
      progress: 1,
      lastError: null,
      sizeBytes: 12_345,
      downloadedAt: '2026-09-01T00:00:00.000Z',
    };
    const { repository, rows } = fakeMapRegions([already]);

    await seedPredefinedRegions(repository);

    // The already-downloaded region keeps its status — re-running the seed
    // on every app start must never reset progress back to zero.
    expect(rows.get(already.id)).toEqual(already);
    // Every other predefined region still gets created.
    expect(rows.size).toBe(PREDEFINED_REGIONS.length);
  });

  it('is safe to call twice in a row', async () => {
    const { repository, rows } = fakeMapRegions();

    await seedPredefinedRegions(repository);
    await seedPredefinedRegions(repository);

    expect(rows.size).toBe(PREDEFINED_REGIONS.length);
  });
});
