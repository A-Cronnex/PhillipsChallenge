/**
 * Builds the self-hosted basemap from OpenFreeMap's data and cartographic
 * assets. Re-runnable; everything it writes is gitignored and safe to delete.
 *
 * What it produces under `tileserver/`:
 *   - `vendor/planetiler.jar`      — pinned Planetiler build tool.
 *   - `data/<area>.mbtiles`        — vector tiles per area, OpenMapTiles schema.
 *   - `assets/fonts/<stack>/*.pbf` — OpenFreeMap glyph PBFs.
 *   - `assets/sprites/ofm_f384/*`  — OpenFreeMap sprite sheet.
 *   - `styles/liberty.json`        — refreshed copy of OpenFreeMap's Liberty style.
 *
 * This is a build-time tool, not a runtime dependency: nothing under
 * `tileserver/` runs on the device, and the app only ever talks to this
 * project's own tile server (`services/maps/tile-source.ts` enforces that).
 * OpenFreeMap's asset bucket and Geofabrik are one-time fetches here, not
 * third-party providers the app depends on.
 *
 * Prerequisites: a JDK 21+ on PATH (Planetiler runs on the JVM) and `tar`.
 *
 * Planetiler downloads each area's OSM extract from Geofabrik itself, plus
 * Natural Earth and OSM water polygons on first run (cached under
 * `vendor/planetiler-data/`). "brazil" is a multi-GB build and can take
 * 30-60 min; "panama" is minutes.
 *
 * Environment overrides:
 *   PLANETILER_AREAS=panama         comma-separated Geofabrik area names
 *   PLANETILER_XMX=2g               JVM max heap (default 6g)
 *   PLANETILER_EXTRA_ARGS="--storage=mmap --nodemap-storage=mmap"
 *                                   extra Planetiler flags (low-memory hosts)
 *   REBUILD=1                       rebuild an area even if data/<area>.mbtiles exists
 *   REFRESH_ASSETS=1               re-download fonts/sprites/style even if present
 */
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const ASSETS_DIR = join(ROOT, 'assets');
const STYLES_DIR = join(ROOT, 'styles');
const VENDOR_DIR = join(ROOT, 'vendor');
const TMP_DIR = join(VENDOR_DIR, 'tmp');

const PLANETILER_VERSION = '0.9.0';
const PLANETILER_URL = `https://github.com/onthegomap/planetiler/releases/download/v${PLANETILER_VERSION}/planetiler.jar`;
const PLANETILER_JAR = join(VENDOR_DIR, 'planetiler.jar');

const AREAS: string[] = (process.env.PLANETILER_AREAS ?? 'brazil,panama')
  .split(',')
  .map((area: string) => area.trim())
  .filter((area: string) => area.length > 0);
const JVM_MAX_HEAP = process.env.PLANETILER_XMX ?? '6g';
const PLANETILER_EXTRA_ARGS = (process.env.PLANETILER_EXTRA_ARGS ?? '')
  .split(' ')
  .map((arg: string) => arg.trim())
  .filter((arg: string) => arg.length > 0);
const REBUILD = process.env.REBUILD === '1';
const REFRESH_ASSETS = process.env.REFRESH_ASSETS === '1';

// OpenFreeMap distributes its cartographic assets as three tarballs.
const ASSET_TARBALLS = {
  fonts: 'https://assets.openfreemap.com/fonts/ofm.tar.gz',
  sprites: 'https://assets.openfreemap.com/sprites/ofm_f384.tar.gz',
  styles: 'https://assets.openfreemap.com/styles/ofm.tar.gz',
} as const;

async function download(url: string, destination: string): Promise<void> {
  console.log(`[build-tiles] GET ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`download failed: ${response.status} ${response.statusText} — ${url}`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  const webStream = response.body as unknown as NodeWebReadableStream<Uint8Array>;
  await pipeline(Readable.fromWeb(webStream), createWriteStream(destination));
}

function ensurePlanetiler(): void {
  if (existsSync(PLANETILER_JAR)) {
    console.log(`[build-tiles] Planetiler ${PLANETILER_VERSION} already present`);
    return;
  }
  console.log(`[build-tiles] downloading Planetiler ${PLANETILER_VERSION}…`);
  execFileSync('bash', ['-c', `curl -fSL --create-dirs -o "${PLANETILER_JAR}" "${PLANETILER_URL}"`], {
    stdio: 'inherit',
  });
}

function buildArea(area: string): void {
  const output = join(DATA_DIR, `${area}.mbtiles`);
  if (existsSync(output) && !REBUILD) {
    console.log(`[build-tiles] ${area}.mbtiles exists — skipping (set REBUILD=1 to force)`);
    return;
  }
  console.log(`[build-tiles] building ${area} → ${output}`);
  // Planetiler caches the OSM extract + Natural Earth + water polygons it
  // downloads under `data/sources/` (its default) and works in `data/tmp/`;
  // both are gitignored and shared across areas, so a re-run for another area
  // does not re-download.
  execFileSync(
    'java',
    [
      `-Xmx${JVM_MAX_HEAP}`,
      '-jar',
      PLANETILER_JAR,
      '--download',
      `--area=${area}`,
      `--output=${output}`,
      '--force',
      ...PLANETILER_EXTRA_ARGS,
    ],
    { stdio: 'inherit', cwd: ROOT }
  );
}

function extractTarball(tarball: string, into: string, extraArgs: string[] = []): void {
  mkdirSync(into, { recursive: true });
  execFileSync('tar', ['xzf', tarball, '-C', into, ...extraArgs], { stdio: 'inherit' });
}

function assetsPresent(): boolean {
  return (
    existsSync(join(STYLES_DIR, 'liberty.json')) &&
    existsSync(join(ASSETS_DIR, 'sprites', 'ofm_f384', 'ofm.json')) &&
    existsSync(join(ASSETS_DIR, 'fonts', 'Noto Sans Regular', '0-255.pbf'))
  );
}

async function fetchAssets(): Promise<void> {
  if (assetsPresent() && !REFRESH_ASSETS) {
    console.log('[build-tiles] fonts/sprites/style already present — skipping (set REFRESH_ASSETS=1 to re-download)');
    return;
  }
  mkdirSync(TMP_DIR, { recursive: true });

  const fontsTar = join(TMP_DIR, 'fonts.tar.gz');
  await download(ASSET_TARBALLS.fonts, fontsTar);
  // Tarball root is `ofm/<stack>/…`; strip it so stacks land directly in assets/fonts.
  extractTarball(fontsTar, join(ASSETS_DIR, 'fonts'), ['--strip-components=1']);

  const spritesTar = join(TMP_DIR, 'sprites.tar.gz');
  await download(ASSET_TARBALLS.sprites, spritesTar);
  // Tarball root is `ofm_f384/…`; keep it — the style's `sprite` URL ends `/sprites/ofm_f384/ofm`.
  extractTarball(spritesTar, join(ASSETS_DIR, 'sprites'));

  const stylesTar = join(TMP_DIR, 'styles.tar.gz');
  await download(ASSET_TARBALLS.styles, stylesTar);
  extractTarball(stylesTar, TMP_DIR);
  execFileSync('bash', ['-c', `cp "${join(TMP_DIR, 'ofm', 'liberty.json')}" "${join(STYLES_DIR, 'liberty.json')}"`], {
    stdio: 'inherit',
  });

  rmSync(TMP_DIR, { recursive: true, force: true });
}

async function main(): Promise<void> {
  for (const dir of [DATA_DIR, ASSETS_DIR, STYLES_DIR, VENDOR_DIR]) {
    mkdirSync(dir, { recursive: true });
  }

  // Assets first: they are small and quick, so a long area build failing or
  // being interrupted still leaves a servable style + glyphs + sprites.
  await fetchAssets();

  ensurePlanetiler();
  for (const area of AREAS) buildArea(area);

  console.log('[build-tiles] done.');
  console.log(`[build-tiles] areas: ${AREAS.join(', ')}`);
  console.log('[build-tiles] next: npm run build && npm start');
}

main().catch((error) => {
  console.error('[build-tiles] failed:', error);
  process.exitCode = 1;
});
