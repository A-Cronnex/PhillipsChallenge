/**
 * Geographic view of the business data.
 *
 * These types are independent of MapLibre and of GeoJSON (CLAUDE.md §5).
 * Conversion to GeoJSON — the representation format, not the storage format
 * (CLAUDE.md §10) — happens in `geojson.ts`.
 */

/** Longitude/latitude pair. Named fields, not a tuple, so order cannot be confused. */
export interface Coordinates {
  longitude: number;
  latitude: number;
}

/**
 * Where a mapped object's position came from.
 *
 * CONFIRMED (docs/maps.md §6): a Site's coordinates are the customer's
 * location. Equipment is located by its site and has no coordinates of its own,
 * so every piece of equipment at a customer site shares that site's position.
 *
 * This field is what satisfies CLAUDE.md §10's requirement to distinguish site
 * coordinates from equipment coordinates: the distinction is recorded on the
 * value rather than implied by two coordinate columns, so a derived position
 * never masquerades as a measured one.
 *
 * If a later requirement places equipment inside a building, this becomes
 * `'equipment'` for those records and nothing else in the map has to change.
 */
export type PositionSource = 'site' | 'equipment';

/** Equipment as it appears on the map, with the business attributes shown on tap. */
export interface MappedEquipment {
  equipmentId: string;
  siteId: string;
  brand: string | null;
  model: string | null;
  modality: string | null;
  /** Null when unknown; not defaulted to 1, which would invent data. */
  quantity: number | null;
  installationYear: number | null;
  coordinates: Coordinates;
  positionSource: PositionSource;
}

/** A site that has coordinates and can therefore be drawn. */
export interface MappedSite {
  siteId: string;
  name: string;
  city: string | null;
  country: string | null;
  coordinates: Coordinates;
  /** Number of equipment records at this site. */
  equipmentCount: number;
  /**
   * Sum of `quantity` across those records, counting a record with unknown
   * quantity as 1 — it is one known equipment record whose size is unclear.
   */
  equipmentUnitCount: number;
  modalities: string[];
}

/** Why a stored site could not be placed on the map. */
export type UnmappableReason = 'missing_coordinates' | 'invalid_coordinates';

/**
 * A site that exists locally but cannot be drawn.
 *
 * Surfaced rather than filtered away: silently dropping a site would make the
 * map look complete while hiding data the user captured (CLAUDE.md §6).
 */
export interface UnmappableSite {
  siteId: string;
  name: string;
  reason: UnmappableReason;
}

/** Everything the map screen draws, plus what it could not draw. */
export interface MapDataset {
  sites: MappedSite[];
  equipment: MappedEquipment[];
  unmappableSites: UnmappableSite[];
}

/** Geographic extent, as MapLibre expects it: [west, south, east, north]. */
export type BoundingBox = [number, number, number, number];

export function isValidCoordinates(candidate: Coordinates): boolean {
  const { longitude, latitude } = candidate;
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90
  );
}

/**
 * Bounding box containing every mapped site, or null when there are none.
 *
 * A single site produces a zero-area box; the caller is responsible for
 * padding it, since how much padding is appropriate is a camera concern.
 */
export function boundsOf(sites: MappedSite[]): BoundingBox | null {
  if (sites.length === 0) return null;

  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  for (const site of sites) {
    const { longitude, latitude } = site.coordinates;
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }

  return [west, south, east, north];
}

/** Centre of a bounding box, for positioning the camera. */
export function centerOf(bounds: BoundingBox): Coordinates {
  const [west, south, east, north] = bounds;
  return {
    longitude: (west + east) / 2,
    latitude: (south + north) / 2,
  };
}

/** Equipment belonging to one site. */
export function equipmentForSite(
  dataset: MapDataset,
  siteId: string
): MappedEquipment[] {
  return dataset.equipment.filter((item) => item.siteId === siteId);
}
