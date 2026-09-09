import {
  boundsOf,
  centerOf,
  equipmentForSite,
  isValidCoordinates,
  type MapDataset,
  type MappedEquipment,
  type MappedSite,
} from '../../../features/maps/domain/map-features';

function site(overrides: Partial<MappedSite> = {}): MappedSite {
  return {
    siteId: 'site-1',
    name: 'Hospital Example',
    city: 'Panama City',
    country: 'Panama',
    coordinates: { longitude: -79.52, latitude: 8.98 },
    equipmentCount: 0,
    equipmentUnitCount: 0,
    modalities: [],
    ...overrides,
  };
}

describe('isValidCoordinates', () => {
  it('accepts coordinates inside the valid range', () => {
    expect(isValidCoordinates({ longitude: -79.52, latitude: 8.98 })).toBe(true);
  });

  it('accepts the extremes', () => {
    expect(isValidCoordinates({ longitude: -180, latitude: -90 })).toBe(true);
    expect(isValidCoordinates({ longitude: 180, latitude: 90 })).toBe(true);
  });

  it('rejects an out-of-range latitude', () => {
    expect(isValidCoordinates({ longitude: 0, latitude: 91 })).toBe(false);
  });

  it('rejects an out-of-range longitude', () => {
    expect(isValidCoordinates({ longitude: 181, latitude: 0 })).toBe(false);
  });

  it('rejects NaN, which JSON round-trips can produce', () => {
    expect(isValidCoordinates({ longitude: Number.NaN, latitude: 0 })).toBe(false);
  });
});

describe('boundsOf', () => {
  it('returns null when there is nothing to bound', () => {
    expect(boundsOf([])).toBeNull();
  });

  it('returns a zero-area box for a single site', () => {
    expect(boundsOf([site()])).toEqual([-79.52, 8.98, -79.52, 8.98]);
  });

  it('returns [west, south, east, north] across several sites', () => {
    const bounds = boundsOf([
      site({ siteId: 'a', coordinates: { longitude: -79, latitude: 9 } }),
      site({ siteId: 'b', coordinates: { longitude: -82, latitude: 7 } }),
      site({ siteId: 'c', coordinates: { longitude: -77, latitude: 12 } }),
    ]);

    expect(bounds).toEqual([-82, 7, -77, 12]);
  });
});

describe('centerOf', () => {
  it('returns the midpoint of the box', () => {
    expect(centerOf([-82, 7, -78, 11])).toEqual({
      longitude: -80,
      latitude: 9,
    });
  });
});

describe('equipmentForSite', () => {
  const equipment = (id: string, siteId: string): MappedEquipment => ({
    equipmentId: id,
    siteId,
    brand: 'Philips',
    model: null,
    modality: 'Monitor',
    quantity: 2,
    installationYear: null,
    coordinates: { longitude: -79.52, latitude: 8.98 },
    positionSource: 'site',
  });

  const dataset: MapDataset = {
    sites: [site()],
    equipment: [equipment('e1', 'site-1'), equipment('e2', 'site-2')],
    unmappableSites: [],
  };

  it('returns only the equipment at the requested site', () => {
    expect(equipmentForSite(dataset, 'site-1').map((e) => e.equipmentId)).toEqual([
      'e1',
    ]);
  });

  it('returns an empty list for a site with no equipment', () => {
    expect(equipmentForSite(dataset, 'site-3')).toEqual([]);
  });
});
