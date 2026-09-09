/**
 * Conversion from domain objects to GeoJSON.
 *
 * GeoJSON is the representation format handed to MapLibre; it is not where
 * business data lives (CLAUDE.md §10). Nothing reads business state back out
 * of these structures — they are produced, drawn, and discarded.
 *
 * Feature properties are deliberately flat and primitive: MapLibre style
 * expressions can only filter and read primitives, and nested objects would
 * be silently unusable.
 */
import type { MappedSite } from './map-features';

/** Properties carried by a site feature, readable by style expressions. */
export interface SiteFeatureProperties {
  siteId: string;
  name: string;
  equipmentCount: number;
  equipmentUnitCount: number;
}

export type SiteFeature = GeoJSON.Feature<
  GeoJSON.Point,
  SiteFeatureProperties
>;

export type SiteFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  SiteFeatureProperties
>;

export function siteToFeature(site: MappedSite): SiteFeature {
  return {
    type: 'Feature',
    // The site's stable identifier doubles as the feature id, so a tap on the
    // map resolves straight back to the record without a lookup table.
    id: site.siteId,
    geometry: {
      type: 'Point',
      // GeoJSON is [longitude, latitude] — the opposite of how coordinates are
      // usually spoken.
      coordinates: [site.coordinates.longitude, site.coordinates.latitude],
    },
    properties: {
      siteId: site.siteId,
      name: site.name,
      equipmentCount: site.equipmentCount,
      equipmentUnitCount: site.equipmentUnitCount,
    },
  };
}

export function sitesToFeatureCollection(
  sites: MappedSite[]
): SiteFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: sites.map(siteToFeature),
  };
}
