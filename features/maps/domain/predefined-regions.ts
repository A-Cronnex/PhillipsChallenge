/**
 * Fixed catalog of offline map regions the app offers to download.
 *
 * Pure data — no SQL, no MapLibre, no React (CLAUDE.md §5) — so the download
 * button, the seed step that first populates `map_regions`, and any future
 * screen can all read the same bounds and zoom range from one place.
 *
 * The self-hosted tile server (`tileserver/`) only holds data for these two
 * cities plus a country outline for Brazil and Panama
 * (`tileserver/scripts/fetch-osm-sources.ts`); a bigger bounding box would
 * request tiles the server has no data for, which is harmless — it answers
 * with an empty tile (`docs/maps.md §13`) — but pointless to offer.
 */
import type { BoundingBox } from './map-features';

export interface PredefinedRegion {
  id: string;
  name: string;
  /** [west, south, east, north] — MapLibre's order, matching `BoundingBox`. */
  bounds: BoundingBox;
  minZoom: number;
  maxZoom: number;
}

/**
 * Country-level packs cap out at a low zoom: with only a boundary outline and
 * no country-wide street data, requesting anything higher would spend a much
 * bigger download on tiles that come back empty everywhere outside the two
 * cities.
 */
const COUNTRY_MAX_ZOOM = 7;

/**
 * City-level packs go high enough to show individual streets, matching
 * `services/maps/offline-regions.ts`'s own `DEFAULT_MAX_ZOOM` reasoning: past
 * 14–15 the pack grows faster than its usefulness for locating a site.
 */
const CITY_MIN_ZOOM = 9;
const CITY_MAX_ZOOM = 15;

export const PREDEFINED_REGIONS: PredefinedRegion[] = [
  {
    id: 'region-brazil',
    name: 'Brasil (contorno)',
    bounds: [-73.99, -33.75, -28.63, 5.27],
    minZoom: 0,
    maxZoom: COUNTRY_MAX_ZOOM,
  },
  {
    id: 'region-panama',
    name: 'Panamá (contorno)',
    bounds: [-83.05, 7.02, -77.15, 9.85],
    minZoom: 0,
    maxZoom: COUNTRY_MAX_ZOOM,
  },
  {
    id: 'region-sao-paulo',
    name: 'Sao Paulo',
    // Matches the bbox fetched into tileserver/data (fetch-osm-sources.ts).
    bounds: [-46.72, -23.62, -46.54, -23.48],
    minZoom: CITY_MIN_ZOOM,
    maxZoom: CITY_MAX_ZOOM,
  },
  {
    id: 'region-panama-city',
    name: 'Ciudad de Panamá',
    bounds: [-79.60, 8.93, -79.44, 9.04],
    minZoom: CITY_MIN_ZOOM,
    maxZoom: CITY_MAX_ZOOM,
  },
];
