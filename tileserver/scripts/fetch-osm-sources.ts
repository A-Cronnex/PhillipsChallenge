/**
 * One-time (re-runnable) data fetch for the self-hosted basemap.
 *
 * Pulls a small, purpose-built extract from OpenStreetMap's Overpass API —
 * not a whole-country .pbf — for exactly the areas this app needs a basemap
 * for: São Paulo, Panama City, and a boundary outline for Brazil and Panama.
 * This keeps the self-hosted tile pipeline light enough to run without the
 * usual toolchain (osmium, tippecanoe): the output is plain GeoJSON, sliced
 * into vector tiles at request time by `geojson-vt` (see ../src/main.ts).
 *
 * This is a build-time tool, not a runtime dependency of the app: nothing
 * under `tileserver/` runs on the device, and the app's own runtime tile
 * requests only ever hit this project's own server
 * (`services/maps/tile-source.ts` enforces that). Overpass is a one-time
 * fetch, not a "third-party tile provider" the app depends on.
 *
 * Re-run this script to refresh the data; it always overwrites
 * `data/*.geojson`, never modifies them by hand.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
// Overpass requires a descriptive User-Agent (its usage policy blocks
// anonymous scripted clients); requests without one are refused outright.
const HEADERS = {
  'content-type': 'application/x-www-form-urlencoded',
  accept: 'application/json',
  'user-agent': 'hospital-equipment-intelligence-hackathon-demo/0.1 (self-hosted basemap build step)',
};

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

interface OverpassGeometryPoint { lat: number; lon: number }
interface OverpassWay {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  geometry?: OverpassGeometryPoint[];
}
interface OverpassRelationMember {
  type: 'way';
  ref: number;
  role: string;
  geometry?: OverpassGeometryPoint[];
}
interface OverpassRelation {
  type: 'relation';
  id: number;
  tags?: Record<string, string>;
  members?: OverpassRelationMember[];
}
type OverpassElement = OverpassWay | OverpassRelation;
interface OverpassResponse { elements: OverpassElement[] }

interface GeoJsonFeature {
  type: 'Feature';
  properties: Record<string, string | number | null>;
  geometry:
    | { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'Polygon'; coordinates: [number, number][][] };
}
interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

function toRing(points: OverpassGeometryPoint[]): [number, number][] {
  return points.map((point) => [point.lon, point.lat]);
}

function isClosed(ring: [number, number][]): boolean {
  if (ring.length < 4) return false;
  const [firstLon, firstLat] = ring[0];
  const [lastLon, lastLat] = ring[ring.length - 1];
  return firstLon === lastLon && firstLat === lastLat;
}

/**
 * Converts Overpass `out geom;` ways into GeoJSON features.
 *
 * `asPolygon` closes area features (water, landuse) into polygons when the
 * way is already closed; an unclosed "area" way is skipped rather than
 * force-closed, since guessing the missing edge would draw something that
 * was never surveyed.
 */
function waysToFeatures(
  elements: OverpassElement[],
  asPolygon: boolean
): GeoJsonFeature[] {
  const features: GeoJsonFeature[] = [];
  for (const element of elements) {
    if (element.type !== 'way' || !element.geometry || element.geometry.length < 2) continue;
    const ring = toRing(element.geometry);
    const properties = { ...(element.tags ?? {}), osmId: element.id };

    if (asPolygon) {
      if (!isClosed(ring)) continue;
      features.push({ type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [ring] } });
    } else {
      features.push({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates: ring } });
    }
  }
  return features;
}

/** Country outline: the outer ways of the admin_level=2 relation, as lines — an outline, not a filled polygon (§ see module docs). */
function boundaryToFeatures(relation: OverpassRelation | undefined, countryName: string): GeoJsonFeature[] {
  if (!relation?.members) return [];
  const features: GeoJsonFeature[] = [];
  for (const member of relation.members) {
    if (member.role !== 'outer' || !member.geometry || member.geometry.length < 2) continue;
    features.push({
      type: 'Feature',
      properties: { country: countryName },
      geometry: { type: 'LineString', coordinates: toRing(member.geometry) },
    });
  }
  return features;
}

async function overpass(query: string): Promise<OverpassResponse> {
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: HEADERS,
    body: 'data=' + encodeURIComponent(query),
  });
  if (!response.ok) {
    throw new Error(`Overpass request failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as OverpassResponse;
}

/** [south, west, north, east] — Overpass's bbox filter order, not GeoJSON's. */
type Bbox = [number, number, number, number];

// Half-extents chosen to cover each city's core without pulling in a
// building-footprint-scale payload (docs/maps.md §5: keep this self-hosted
// pipeline light). Individual buildings are deliberately not fetched — at
// São Paulo's scale that is millions of polygons for no benefit to a
// installed-base map, which needs streets and district context, not rooftops.
const CITY_BBOXES: Record<string, Bbox> = {
  sao_paulo: [-23.62, -46.72, -23.48, -46.54],
  panama_city: [8.93, -79.60, 9.04, -79.44],
};

const AREA_QUERY = (bbox: Bbox, filter: string) =>
  `[out:json][timeout:120];(${filter.split('|').map((f) => `way["${f}"](${bbox.join(',')});`).join('')});out geom;`;

async function fetchCityLayers(name: string, bbox: Bbox) {
  console.log(`[fetch-osm-sources] ${name}: roads…`);
  const roads = await overpass(
    `[out:json][timeout:120];
     way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street)$"](${bbox.join(',')});
     out geom;`
  );

  console.log(`[fetch-osm-sources] ${name}: water…`);
  const water = await overpass(
    `[out:json][timeout:120];
     (
       way["natural"="water"](${bbox.join(',')});
       way["waterway"~"^(river|canal)$"](${bbox.join(',')});
     );
     out geom;`
  );

  console.log(`[fetch-osm-sources] ${name}: landuse…`);
  const landuse = await overpass(
    `[out:json][timeout:120];
     way["landuse"~"^(residential|commercial|industrial|retail)$"](${bbox.join(',')});
     out geom;`
  );

  const roadFeatures = waysToFeatures(roads.elements, false);
  const waterFeatures = waysToFeatures(water.elements, true);
  const landuseFeatures = waysToFeatures(landuse.elements, true);

  return { roadFeatures, waterFeatures, landuseFeatures };
}

async function fetchCountryBoundary(name: string, iso: string): Promise<GeoJsonFeature[]> {
  console.log(`[fetch-osm-sources] boundary: ${name}…`);
  const response = await overpass(
    `[out:json][timeout:180];
     relation["boundary"="administrative"]["admin_level"="2"]["ISO3166-1"="${iso}"];
     out geom;`
  );
  const relation = response.elements.find((el): el is OverpassRelation => el.type === 'relation');
  return boundaryToFeatures(relation, name);
}

function writeCollection(fileName: string, features: GeoJsonFeature[]): void {
  const collection: GeoJsonFeatureCollection = { type: 'FeatureCollection', features };
  writeFileSync(join(DATA_DIR, fileName), JSON.stringify(collection));
  console.log(`[fetch-osm-sources] wrote ${fileName}: ${features.length} feature(s)`);
}

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });

  const roads: GeoJsonFeature[] = [];
  const water: GeoJsonFeature[] = [];
  const landuse: GeoJsonFeature[] = [];

  for (const [name, bbox] of Object.entries(CITY_BBOXES)) {
    const layers = await fetchCityLayers(name, bbox);
    roads.push(...layers.roadFeatures);
    water.push(...layers.waterFeatures);
    landuse.push(...layers.landuseFeatures);
  }

  writeCollection('roads.geojson', roads);
  writeCollection('water.geojson', water);
  writeCollection('landuse.geojson', landuse);

  const boundaries: GeoJsonFeature[] = [];
  boundaries.push(...(await fetchCountryBoundary('Brazil', 'BR')));
  boundaries.push(...(await fetchCountryBoundary('Panama', 'PA')));
  writeCollection('country_boundaries.geojson', boundaries);

  console.log('[fetch-osm-sources] done.');
}

main().catch((error) => {
  console.error('[fetch-osm-sources] failed:', error);
  process.exitCode = 1;
});
