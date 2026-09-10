/**
 * Minimal ambient typing for `vt-pbf`, matching the shape geojson-vt.d.ts
 * declares for a sliced tile — see that file for why these are hand-written
 * instead of the community `@types` packages.
 */
declare module 'vt-pbf' {
  import type { VectorTile } from 'geojson-vt';

  interface VtPbf {
    fromGeojsonVt(
      layers: Record<string, VectorTile>,
      options?: { version?: number; extent?: number }
    ): Uint8Array;
  }

  const vtpbf: VtPbf;
  export default vtpbf;
}
