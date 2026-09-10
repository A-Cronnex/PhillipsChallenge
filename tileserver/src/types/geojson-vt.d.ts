/**
 * Ambient typing for `geojson-vt`, mirroring the real `LegacyTile`/`GeoJSONVT`
 * shapes the installed package (5.x) ships in its own `src/index.d.ts`.
 *
 * Written by hand rather than relying on that file being resolved
 * automatically: the package's `package.json` points `exports` at
 * `./src/index.js` with no `types` field, which plain `"moduleResolution":
 * "node"` (this project's setting) does not follow — it would report
 * `geojson-vt` as untyped. `@types/geojson-vt` on npm is no better: it types
 * an older, pre-5.x shape (a plain factory function, not this class), which
 * fails against the API actually installed. This file exists to be the one
 * accurate source, kept intentionally narrow to what `../main.ts` calls.
 */
declare module 'geojson-vt' {
  import type { GeoJSON } from 'geojson';

  export interface GeoJSONVTOptions {
    maxZoom?: number;
    tolerance?: number;
    extent?: number;
    buffer?: number;
    indexMaxZoom?: number;
    indexMaxPoints?: number;
  }

  /**
   * One feature inside a sliced tile, in the vector-tile-spec's JSON shape:
   * `type` 1 = point(s), 2 = line(s), 3 = polygon(s); `geometry` nests one
   * level deeper for lines/polygons (one array of [x, y] pairs per part).
   */
  export interface VectorTileFeature {
    id?: number | string;
    tags: Record<string, unknown> | null;
    type: 1 | 2 | 3;
    geometry: [number, number][] | [number, number][][];
  }

  export interface VectorTile {
    features: VectorTileFeature[];
  }

  export default class GeoJSONVTIndex {
    constructor(data: GeoJSON, options?: GeoJSONVTOptions);
    getTile(z: number | string, x: number | string, y: number | string): VectorTile | null;
  }
}
