/**
 * Process entrypoint for the self-hosted basemap server.
 *
 * Serves a MapLibre style plus everything that style references — vector
 * tiles, glyph (font) PBFs and a sprite sheet — all from this project's own
 * process, so the app has no third-party map dependency at runtime
 * (docs/tech-stack.md §4a).
 *
 * The data comes from OpenFreeMap's pipeline, built locally by
 * `npm run build-tiles` (see `scripts/build-tiles.ts`):
 *   - `data/*.mbtiles`  — Planetiler-built vector tiles, OpenMapTiles schema.
 *   - `assets/fonts/*`  — OpenFreeMap glyph PBFs (Noto Sans Regular/Bold/Italic).
 *   - `assets/sprites/*`— OpenFreeMap sprite sheet (`ofm_f384`).
 *   - `styles/liberty.json` — OpenFreeMap's Liberty style, vendored.
 *
 * Uses Node's built-in `http` module and no framework, matching
 * `server/src/main.ts`'s reasoning: a handful of static routes need no routing
 * library. Tiles are read straight from the MBTiles SQLite file by prepared
 * statement (`src/mbtiles.ts`) — there is no request-time slicing anymore.
 *
 * Run with (mirrors server/README.md's Setup section):
 *   cd tileserver && npm install
 *   npm run build-tiles     # downloads Planetiler + OpenFreeMap assets, builds data/*.mbtiles
 *   npm run build && npm start
 *
 * Prerequisites for `build-tiles`: a JDK 21+ on PATH (Planetiler) and `tar`.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, normalize } from 'node:path';

import { isGzip, Mbtiles } from './mbtiles';
import { buildStyle } from './style';

// Compiled to CommonJS (tsconfig.json), so `__dirname` is the real CJS global
// here. `rootDir: ".."` means this file compiles to `dist/tileserver/src/main.js`,
// three levels below `tileserver/`.
const TILESERVER_ROOT = join(__dirname, '..', '..', '..');
const DATA_DIR = join(TILESERVER_ROOT, 'data');
const FONTS_DIR = join(TILESERVER_ROOT, 'assets', 'fonts');
const SPRITES_DIR = join(TILESERVER_ROOT, 'assets', 'sprites');

const TILE_PATH = /^\/tiles\/(\d+)\/(\d+)\/(\d+)\.pbf$/;
const FONT_PATH = /^\/fonts\/([^/]+)\/(\d+-\d+)\.pbf$/;
const SPRITE_PATH = /^\/sprites\/([^/]+)\/([^/]+?)(@2x)?\.(json|png)$/;

/** Opens every `.mbtiles` in `data/`. First file with a tile at a coordinate wins. */
function openTileSources(): Mbtiles[] {
  let files: string[];
  try {
    files = readdirSync(DATA_DIR).filter((name) => name.endsWith('.mbtiles'));
  } catch {
    files = [];
  }

  if (files.length === 0) {
    console.warn(
      `[tileserver] no .mbtiles found in ${DATA_DIR} — run "npm run build-tiles" first. ` +
        'Tile requests will return 204.'
    );
    return [];
  }

  return files.map((name) => {
    const source = new Mbtiles(join(DATA_DIR, name));
    console.log(
      `[tileserver] loaded ${name} (z${source.metadata.minzoom}-${source.metadata.maxzoom}, ` +
        `${source.metadata.vectorLayers.length} vector layer(s))`
    );
    return source;
  });
}

function handleTileRequest(
  sources: Mbtiles[],
  path: string,
  response: ServerResponse
): boolean {
  const match = TILE_PATH.exec(path);
  if (!match) return false;

  const z = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);

  let tile: Buffer | null = null;
  for (const source of sources) {
    tile = source.getTile(z, x, y);
    if (tile) break;
  }

  if (!tile) {
    // A valid, empty response — most of the world has no tile in these
    // regional extracts.
    response.writeHead(204);
    response.end();
    return true;
  }

  // Planetiler stores tiles gzip-compressed; pass those through untouched.
  // Guard anyway in case a future source stores them raw.
  const gzipped = isGzip(tile) ? tile : gzipSync(tile);
  response.writeHead(200, {
    'content-type': 'application/x-protobuf',
    'content-encoding': 'gzip',
    // Tiles are static for the process's lifetime — this server has no write
    // path — so caching aggressively costs nothing.
    'cache-control': 'public, max-age=86400',
  });
  response.end(gzipped);
  return true;
}

/** Resolves a request path segment to a file inside `baseDir`, or `null` if it escapes it. */
function safeJoin(baseDir: string, ...segments: string[]): string | null {
  const resolved = normalize(join(baseDir, ...segments));
  return resolved === baseDir || resolved.startsWith(baseDir + '/') ? resolved : null;
}

function serveFile(
  filePath: string,
  contentType: string,
  contentEncoding: string | null,
  response: ServerResponse
): void {
  let body: Buffer;
  try {
    body = readFileSync(filePath);
  } catch {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found' }));
    return;
  }
  const headers: Record<string, string> = {
    'content-type': contentType,
    'cache-control': 'public, max-age=86400',
  };
  if (contentEncoding) headers['content-encoding'] = contentEncoding;
  response.writeHead(200, headers);
  response.end(body);
}

/**
 * `/fonts/{fontstack}/{range}.pbf`. MapLibre may request a comma-joined
 * fallback stack ("Noto Sans Regular,Noto Sans Bold"); the assets only have
 * single-name directories, so try each name in order and serve the first hit.
 */
function handleFontRequest(path: string, response: ServerResponse): boolean {
  const match = FONT_PATH.exec(path);
  if (!match) return false;

  const fontstack = decodeURIComponent(match[1]);
  const range = match[2];

  for (const name of fontstack.split(',')) {
    const candidate = safeJoin(FONTS_DIR, name.trim(), `${range}.pbf`);
    if (!candidate) continue;
    try {
      const body = readFileSync(candidate);
      response.writeHead(200, {
        'content-type': 'application/x-protobuf',
        'cache-control': 'public, max-age=604800',
      });
      response.end(body);
      return true;
    } catch {
      // Try the next name in the fallback stack.
    }
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not_found' }));
  return true;
}

/** `/sprites/{set}/{name}(@2x)?.(json|png)`. */
function handleSpriteRequest(path: string, response: ServerResponse): boolean {
  const match = SPRITE_PATH.exec(path);
  if (!match) return false;

  const [, set, name, retina, extension] = match;
  const fileName = `${name}${retina ?? ''}.${extension}`;
  const candidate = safeJoin(SPRITES_DIR, decodeURIComponent(set), fileName);
  if (!candidate) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found' }));
    return true;
  }

  serveFile(
    candidate,
    extension === 'json' ? 'application/json' : 'image/png',
    null,
    response
  );
  return true;
}

function handleStyleRequest(
  request: IncomingMessage,
  path: string,
  response: ServerResponse
): boolean {
  if (path !== '/styles/self-hosted.json') return false;

  // The style must point back at whatever host:port the client used to reach
  // this server — on a phone that is the machine's LAN IP, which varies by
  // network. Deriving it from the request's own Host header keeps the style
  // correct without hardcoding an address.
  const host = request.headers.host ?? 'localhost';
  const style = buildStyle(`http://${host}`);
  response.writeHead(200, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(style));
  return true;
}

export function main(): void {
  const sources = openTileSources();

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    try {
      const path = (request.url ?? '/').split('?')[0];

      if (handleStyleRequest(request, path, response)) return;
      if (handleTileRequest(sources, path, response)) return;
      if (handleFontRequest(path, response)) return;
      if (handleSpriteRequest(path, response)) return;

      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not_found' }));
    } catch (error) {
      console.error('[tileserver] request failed:', error instanceof Error ? error.message : error);
      if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'internal_error' }));
    }
  });

  const port = Number(process.env.PORT ?? 8090);
  // 0.0.0.0, not 127.0.0.1: a phone on the same Wi-Fi reaches this process by
  // the development machine's LAN IP, same as Metro does for the JS bundle.
  const host = process.env.HOST ?? '0.0.0.0';
  server.listen(port, host, () => {
    console.log(`[tileserver] listening on ${host}:${port}`);
    console.log(`[tileserver] style: http://<this-machine-lan-ip>:${port}/styles/self-hosted.json`);
  });
}

// Mirrors server/src/main.ts's guard: importing the compiled module (from a
// test, say) must not bind a socket as a side effect.
declare const require: { main?: unknown } | undefined;
declare const module: unknown;
const isProcessEntrypoint =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require?.main === module;

if (isProcessEntrypoint) {
  main();
}
