/**
 * The MapLibre style this server serves at `/styles/self-hosted.json`.
 *
 * The style itself is OpenFreeMap's **Liberty** style (`styles/liberty.json`,
 * MIT-licensed, vendored verbatim and refreshed by `scripts/build-tiles.ts`).
 * It targets the OpenMapTiles schema, which is what Planetiler produces for
 * `data/*.mbtiles`.
 *
 * The upstream file uses the literal placeholder host
 * `https://__TILEJSON_DOMAIN__`. `buildStyle` swaps that for whatever host the
 * client actually reached this server on, then makes two edits so the style is
 * self-contained against *this* server:
 *
 * 1. The `openmaptiles` vector source is rewritten from a TileJSON `url` to an
 *    explicit `tiles` array pointing at `/tiles/{z}/{x}/{y}.pbf` — this server
 *    has no TileJSON endpoint, only the tile route.
 * 2. The `ne2_shaded` raster source (a low-zoom Natural Earth relief) and the
 *    single layer that uses it are dropped. Those tiles are not self-hosted
 *    here (docs/maps.md §4); the vector basemap is unaffected.
 *
 * `glyphs` and `sprite` are left pointing at this server's own `/fonts` and
 * `/sprites` routes. Unlike the previous background-only style, this one *does*
 * declare them and *does* use `symbol` layers — that is deliberate and still
 * satisfies docs/tech-stack.md §4a, because both are served from this
 * project's own process, not a third-party CDN (docs/maps.md §3).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Compiled to `dist/tileserver/src/style.js` (tsconfig `rootDir: ".."`), so
// `styles/` sits three levels up — same offset `main.ts` uses for `data/`.
const STYLE_PATH = join(__dirname, '..', '..', '..', 'styles', 'liberty.json');

const PLACEHOLDER_HOST = 'https://__TILEJSON_DOMAIN__';

interface RasterOrVectorSource {
  type: string;
  url?: string;
  tiles?: string[];
  [key: string]: unknown;
}

interface StyleDocument {
  version: number;
  sources: Record<string, RasterOrVectorSource>;
  sprite?: string;
  glyphs?: string;
  layers: { id: string; source?: string; [key: string]: unknown }[];
  [key: string]: unknown;
}

/** The raw vendored style, read once and reused (it is immutable input). */
let cachedRawStyle: string | null = null;

function readRawStyle(): string {
  if (cachedRawStyle === null) cachedRawStyle = readFileSync(STYLE_PATH, 'utf8');
  return cachedRawStyle;
}

export function buildStyle(baseUrl: string): StyleDocument {
  const withHost = readRawStyle().split(PLACEHOLDER_HOST).join(baseUrl);
  const style = JSON.parse(withHost) as StyleDocument;

  style.sources.openmaptiles = {
    type: 'vector',
    tiles: [`${baseUrl}/tiles/{z}/{x}/{y}.pbf`],
    minzoom: 0,
    // OpenMapTiles / Planetiler tiles stop at z14; MapLibre overzooms past it.
    maxzoom: 14,
  };

  delete style.sources.ne2_shaded;
  style.layers = style.layers.filter((layer) => layer.source !== 'ne2_shaded');

  return style;
}
