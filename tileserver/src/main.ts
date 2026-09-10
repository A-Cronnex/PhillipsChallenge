/**
 * Process entrypoint for the self-hosted basemap server.
 *
 * Serves a MapLibre style and its vector tiles, built from the extracts in
 * `data/*.geojson` (produced by `npm run fetch-sources`, see
 * `scripts/fetch-osm-sources.ts`). This is what `docs/maps.md §5` calls
 * option 1 — "serve tiles over HTTP from the project's own backend" — the
 * one this repository had documented but never built.
 *
 * Uses Node's built-in `http` module and no framework, matching
 * `server/src/main.ts`'s reasoning: two routes need no routing library.
 *
 * Tiles are sliced from the GeoJSON extracts at request time by
 * `geojson-vt`, not pre-rendered into a `.mbtiles` file — there is no
 * tippecanoe/osmium toolchain installed in this environment, and a pure-JS
 * pipeline needs none. `geojson-vt` builds its per-layer index once, at
 * startup, from data already resident in memory (~22MB across four files),
 * so per-request work is just slicing an already-built tile, not
 * reprocessing the source.
 *
 * Run with (mirrors server/README.md's Setup section):
 *   cd tileserver && npm install
 *   npm run fetch-sources   # writes data/*.geojson (re-run to refresh)
 *   npm run build && npm start
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

import GeoJSONVT, { type VectorTile } from 'geojson-vt';
import vtpbf from 'vt-pbf';

import { buildStyle } from './style';

// Compiled to CommonJS (tsconfig.json), so `__dirname` is the real,
// synchronous CJS global here (from @types/node) — not the ESM
// `import.meta.url` dance, which `tsc --module commonjs` refuses to emit.
// `rootDir: ".."` (tsconfig.json) means this file compiles to
// `dist/tileserver/src/main.js`, three levels below `tileserver/`.
const DATA_DIR = join(__dirname, '..', '..', '..', 'data');

const LAYER_FILES = {
  roads: 'roads.geojson',
  water: 'water.geojson',
  landuse: 'landuse.geojson',
  country_boundaries: 'country_boundaries.geojson',
} as const;

type LayerName = keyof typeof LAYER_FILES;

type TileIndex = InstanceType<typeof GeoJSONVT>;

/** Built once at startup; `getTile` on an existing index is cheap. */
function buildTileIndexes(): Record<LayerName, TileIndex> {
  const indexes = {} as Record<LayerName, TileIndex>;
  for (const [layer, file] of Object.entries(LAYER_FILES) as [LayerName, string][]) {
    const raw = readFileSync(join(DATA_DIR, file), 'utf8');
    const geojson = JSON.parse(raw);
    console.log(`[tileserver] indexing ${layer} (${geojson.features.length} features)…`);
    indexes[layer] = new GeoJSONVT(geojson, { maxZoom: 16, buffer: 64 });
  }
  return indexes;
}

const TILE_PATH = /^\/tiles\/(\d+)\/(\d+)\/(\d+)\.pbf$/;

function handleTileRequest(
  indexes: Record<LayerName, TileIndex>,
  path: string,
  response: ServerResponse
): boolean {
  const match = TILE_PATH.exec(path);
  if (!match) return false;

  const z = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);

  const layerMap: Record<string, VectorTile> = {};
  for (const layer of Object.keys(indexes) as LayerName[]) {
    const tile = indexes[layer].getTile(z, x, y);
    if (tile && tile.features.length > 0) layerMap[layer] = tile;
  }

  if (Object.keys(layerMap).length === 0) {
    // A valid, empty response — most tiles outside the two city extracts
    // have no roads/water/landuse, only (possibly) a boundary line.
    response.writeHead(204);
    response.end();
    return true;
  }

  const buffer = vtpbf.fromGeojsonVt(layerMap);
  const gzipped = gzipSync(buffer);
  response.writeHead(200, {
    'content-type': 'application/x-protobuf',
    'content-encoding': 'gzip',
    // Tiles are static for the process's lifetime — this server has no
    // write path — so caching aggressively costs nothing and saves the
    // repeat re-slicing.
    'cache-control': 'public, max-age=86400',
  });
  response.end(gzipped);
  return true;
}

function handleStyleRequest(request: IncomingMessage, path: string, response: ServerResponse): boolean {
  if (path !== '/styles/self-hosted.json') return false;

  // The style must point back at whatever host:port the client actually used
  // to reach this server — on a phone that's the machine's LAN IP, which
  // varies by network. Deriving it from the request's own Host header means
  // the style is correct without hardcoding an address anywhere.
  const host = request.headers.host ?? 'localhost';
  const style = buildStyle(`http://${host}`);
  const body = JSON.stringify(style);
  response.writeHead(200, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  response.end(body);
  return true;
}

export function main(): void {
  const indexes = buildTileIndexes();

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    try {
      const path = (request.url ?? '/').split('?')[0];

      if (handleStyleRequest(request, path, response)) return;
      if (handleTileRequest(indexes, path, response)) return;

      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not_found' }));
    } catch (error) {
      console.error('[tileserver] request failed:', error instanceof Error ? error.message : error);
      if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'internal_error' }));
    }
  });

  const port = Number(process.env.PORT ?? 8090);
  // 0.0.0.0, not 127.0.0.1: a phone on the same Wi-Fi needs to reach this
  // process by the development machine's LAN IP, same as Metro already does
  // for the JS bundle (docs/android-installation.md).
  const host = process.env.HOST ?? '0.0.0.0';
  server.listen(port, host, () => {
    console.log(`[tileserver] listening on ${host}:${port}`);
    console.log(`[tileserver] style: http://<this-machine-lan-ip>:${port}/styles/self-hosted.json`);
  });
}

// Compiled to CommonJS (tsconfig.json), so this mirrors server/src/main.ts's
// own guard: importing the compiled module — from a test, say — must not
// bind a socket as a side effect, only running it as the process entrypoint
// does.
declare const require: { main?: unknown } | undefined;
declare const module: unknown;
const isProcessEntrypoint =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require?.main === module;

if (isProcessEntrypoint) {
  main();
}
