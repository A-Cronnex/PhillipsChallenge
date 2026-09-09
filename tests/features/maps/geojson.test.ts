import {
  siteToFeature,
  sitesToFeatureCollection,
} from '../../../features/maps/domain/geojson';
import type { MappedSite } from '../../../features/maps/domain/map-features';

const site: MappedSite = {
  siteId: 'site-1',
  name: 'Hospital Example',
  city: 'Panama City',
  country: 'Panama',
  coordinates: { longitude: -79.52, latitude: 8.98 },
  equipmentCount: 3,
  equipmentUnitCount: 9,
  modalities: ['Monitor'],
};

describe('siteToFeature', () => {
  it('writes coordinates in GeoJSON order: longitude first', () => {
    expect(siteToFeature(site).geometry.coordinates).toEqual([-79.52, 8.98]);
  });

  it('uses the site id as the feature id so a tap resolves to the record', () => {
    expect(siteToFeature(site).id).toBe('site-1');
  });

  it('carries only primitive properties, which style expressions can read', () => {
    const properties = siteToFeature(site).properties;

    expect(properties).toEqual({
      siteId: 'site-1',
      name: 'Hospital Example',
      equipmentCount: 3,
      equipmentUnitCount: 9,
    });
    for (const value of Object.values(properties)) {
      expect(['string', 'number']).toContain(typeof value);
    }
  });
});

describe('sitesToFeatureCollection', () => {
  it('produces a valid empty collection when there are no sites', () => {
    expect(sitesToFeatureCollection([])).toEqual({
      type: 'FeatureCollection',
      features: [],
    });
  });

  it('produces one feature per site', () => {
    const collection = sitesToFeatureCollection([
      site,
      { ...site, siteId: 'site-2' },
    ]);

    expect(collection.type).toBe('FeatureCollection');
    expect(collection.features).toHaveLength(2);
  });
});
