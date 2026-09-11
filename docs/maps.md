# Maps

## 1. What Is Installed

| Package | Version | Purpose |
|---|---|---|
| `@maplibre/maplibre-react-native` | 11.3.10 | Map rendering |

Its config plugin is registered in `app.json`:

```json
{ "expo": { "plugins": ["expo-router", "expo-sqlite", "@maplibre/maplibre-react-native"] } }
```

`npx expo config --type introspect` resolves the plugin cleanly, so
`npx expo prebuild` will wire the native code in.

**This makes a development build mandatory** (`docs/tech-stack.md` §4). Expo Go
cannot load MapLibre's native code. From now on:

```bash
npx expo prebuild          # regenerate ios/ and android/
npx expo run:android       # or run:ios — installs the dev client
npx expo start --dev-client
```

`ios.bundleIdentifier` and `android.package` are both set to `com.hei.app`;
without the former, prebuild silently emits `com.placeholder.appid`.

## 2. Tile Policy — Self-Hosted Only

`docs/tech-stack.md` §4a forbids any third-party tile provider at runtime.
`services/maps/tile-source.ts` enforces this rather than documenting it:
`assertSelfHostedStyleUrl` throws `CloudTileProviderError` for MapTiler,
Stadia, Mapbox, Carto, Thunderforest, `demotiles.maplibre.org` and the public
OSM tile servers, including subdomains.

A style URL is exactly the kind of value that gets pasted in during a demo and
forgotten, so the check runs at runtime and is covered by tests.

## 3. Basemap Modes

`BasemapConfig.mode` in `services/maps/tile-source.ts`:

- **`none` (the default, active now).** `backgroundOnlyStyle()` returns a
  complete, valid MapLibre style containing a single `background` layer and
  **no sources at all**. The map makes zero network requests and works on a
  device that has never had connectivity — the user sees their sites
  positioned relative to one another on a plain ground, without street detail.
- **`self_hosted_style`.** `styleUrl` points at a style document served by the
  project's own backend or bundled as a `file://` asset. MapLibre resolves the
  tile URLs inside that document, so those must be project-owned too. In
  practice this is `tileserver/`'s `/styles/self-hosted.json` (§4).

**Glyphs and sprites — self-hosted, not forbidden (updated 2026-09-10).**
The concern is a *third-party* glyph/sprite CDN re-entering a nominally
self-hosted style, not glyphs as such. The two style paths handle it
differently:

- The offline fallback `backgroundOnlyStyle()` still declares **no `glyphs`
  and no `sprite`** — it has no server to serve them from, so it uses no
  `symbol` layer and any labels on top are React views.
- The `self_hosted_style` path (OpenFreeMap's Liberty style, §4) **does**
  declare `glyphs` and `sprite`, both pointing at `tileserver/`'s own
  `/fonts` and `/sprites` routes, and **does** use `symbol` layers — so
  street names and place labels are rendered by MapLibre. This is still
  within docs/tech-stack.md §4a: the bytes come from this project's process,
  not a hosted provider. `services/maps/tile-source.ts` rejects
  `openfreemap.org` / `openfreemap.com` in a style URL for exactly that
  reason.

## 4. Generating Tiles — OpenFreeMap / Planetiler pipeline (2026-09-10)

`tileserver/` is a small, separate Node process (own `package.json`, mirroring
`server/`'s "own package so `pg` never reaches the mobile app" reasoning —
here it is "map-tiling libraries never reach the mobile app"). It serves a
self-hosted MapLibre style **and everything that style references** — vector
tiles, glyph PBFs and a sprite sheet — for **Brazil** and **Panamá**
(full national coverage, per product decision).

The earlier pipeline hand-built a tiny Overpass extract and sliced it with
`geojson-vt` at request time. That produced tiles with almost no content —
roads/water/landuse for two city boxes, no buildings, no labels — which is
what "the maps aren't properly vectorized" meant. It is replaced by
**OpenFreeMap**'s approach: real OpenMapTiles-schema vector tiles built by
Planetiler, plus OpenFreeMap's own MIT-licensed **Liberty** style, fonts and
sprites. Same renderer (MapLibre), same self-hosted-only rule
(docs/tech-stack.md §4a) — only the tile *data* and *style* changed.

Pipeline, entirely self-hosted, no cloud tile provider at runtime:

1. `npm run build-tiles` (`tileserver/scripts/build-tiles.ts`):
   - downloads a pinned **Planetiler** jar to `tileserver/vendor/`;
   - runs `java -jar planetiler.jar --download --area=<area>` for each area
     in `PLANETILER_AREAS` (default `brazil,panama`), writing
     `tileserver/data/<area>.mbtiles` — OpenMapTiles schema, z0–14, gzip
     MVT. Planetiler fetches each area's OSM extract from Geofabrik plus
     Natural Earth / water polygons itself (cached in `vendor/`);
   - downloads OpenFreeMap's three asset tarballs from
     `assets.openfreemap.com` and extracts them into
     `tileserver/assets/fonts/` (Noto Sans Regular/Bold/Italic glyph PBFs),
     `tileserver/assets/sprites/ofm_f384/`, and refreshes
     `tileserver/styles/liberty.json`.
   - `data/`, `assets/`, `vendor/` are gitignored; `styles/liberty.json` is
     committed (small) so `npm start` needs no fetch.
   - **Prerequisites:** a JDK 21+ on PATH and `tar`. Brazil is a multi-GB,
     30–60 min build; `PLANETILER_AREAS=panama` alone is a few minutes.
2. `tileserver/src/main.ts` serves, from Node's built-in `http`:
   - `GET /tiles/{z}/{x}/{y}.pbf` — read straight from the `.mbtiles` SQLite
     file by prepared statement (`src/mbtiles.ts`, `better-sqlite3`), with
     the one TMS→XYZ row flip; the stored gzip blob is passed through
     untouched. `204` where no source has a tile.
   - `GET /fonts/{fontstack}/{range}.pbf` — glyph PBFs from `assets/fonts/`,
     splitting a comma-joined fallback stack and serving the first hit.
   - `GET /sprites/ofm_f384/ofm(@2x)?.(json|png)` — from `assets/sprites/`.
   - `GET /styles/self-hosted.json` — `src/style.ts` reads the vendored
     Liberty style, swaps its `__TILEJSON_DOMAIN__` placeholder for the
     request's own `Host`, rewrites the `openmaptiles` source to an explicit
     `/tiles/{z}/{x}/{y}.pbf` array, and drops the `ne2_shaded` Natural
     Earth raster source (not self-hosted here) and its one layer.
   `build-tiles` env overrides (low-memory hosts, subset builds, forced
   re-runs) are documented in the doc comment atop `scripts/build-tiles.ts`:
   `PLANETILER_AREAS`, `PLANETILER_XMX`, `PLANETILER_EXTRA_ARGS`, `REBUILD`,
   `REFRESH_ASSETS`.
3. Point `EXPO_PUBLIC_MAP_STYLE_URL` (`.env`, never committed) at
   `http://<dev-machine-lan-ip>:8090/styles/self-hosted.json`. `PORT`/`HOST`
   are configurable; run steps are in the doc comment atop `src/main.ts`
   (`npm install`, `npm run build-tiles`, `npm run build && npm start`).

**Status (2026-09-10):**

- **Panamá — built and verified at the HTTP layer.** `npm run build-tiles`
  with `PLANETILER_AREAS=panama` produced `data/panama.mbtiles` (~58 MB, 16
  OpenMapTiles layers) in under 3 min with `PLANETILER_XMX=2g`. Against a
  running server: the Panama-City z14 tile returns a 300 KB gzipped MVT
  carrying `transportation`, `transportation_name`, `building`,
  `housenumber`, `place`, `boundary`, `water`, `waterway`, `landuse`,
  `park`, `aeroway`; a z7 tile also serves; an ocean tile returns `204`.
  `/fonts/Noto Sans Regular/0-255.pbf` returns a 76 KB glyph PBF (and a
  comma-joined fallback stack resolves to it); all four
  `/sprites/ofm_f384/ofm*` files return with correct content types.
- **Brasil — built.** Same command with `PLANETILER_AREAS=brazil` →
  `data/brazil.mbtiles` (~2.8 GB, 16 layers) in ~16 min. A first attempt
  hit a transient Geofabrik connect timeout; retried with
  `--http-timeout=180s --http-retries=8`. The build host had ~3 GB free
  RAM, so it ran with `PLANETILER_XMX=2g PLANETILER_EXTRA_ARGS="--storage=mmap
  --nodemap-storage=mmap --nodemap-type=sparsearray"`; drop those on a
  roomier machine.
- **On device (Pixel, dev client, 2026-09-10) — verified.** With
  `EXPO_PUBLIC_MAP_STYLE_URL` pointing at the LAN tile server, the Map tab
  rendered the Liberty style end to end: land/water/landcover fills, the
  road network (primary/secondary lines), route shields, an airport icon,
  and `symbol`-layer labels — country ("Brazil"), cities ("Brasília",
  "Fortaleza", "Panama City", "La Chorrera", "Colón") and italic water
  labels ("Gulf of Panama") — all drawn from the self-hosted `/fonts` and
  `/sprites`. Every request in the tile server's access log was
  `200`/`204`. Selecting a site opened its equipment detail as before.
- **`OfflineManager.createPack` on device — verified.** Searching "Panam"
  in the region bar and pressing *Descargar* for "Ciudad de Panamá" drove
  ~570 requests to the tile server (60 tiles z12–14, ~390 glyph PBFs, the
  sprite sheet — all `200`) and the region row moved `not_downloaded` →
  `downloaded`. The download code is unchanged; this confirms it against
  the `.mbtiles`-backed server and its new glyph/sprite routes.

`src/mbtiles.ts` also has `node --test` coverage for the row flip and
metadata parsing. The tile server logs one line per request unless
`QUIET=1`.

**What this does not cover:** 3D terrain / hillshade (the `ne2_shaded` layer
is dropped), any area outside Brazil/Panamá (add a Geofabrik name to
`PLANETILER_AREAS`), and building-level styling beyond what Liberty +
OpenMapTiles already carry.

## 5. Previously a Known Limitation: `.pmtiles` Is Not Directly Loadable

`docs/tech-stack.md` §4a names Protomaps `.pmtiles` as a distribution format,
but **`@maplibre/maplibre-react-native` 11.3.10 has no PMTiles or MBTiles
support** — verified by inspecting the installed package, which contains no
reference to either format. A `pmtiles://` URL will not load.

This was a real gap between the documented plan and what the library does.
Of the options this section used to list undecided:

1. Serve tiles over HTTP from the project's own backend. **Implemented — see
   §4 above** (`tileserver/`): Planetiler builds a `.mbtiles` file per area
   and `src/main.ts` serves `.pbf` tiles straight out of it. This is why the
   `pmtiles://` gap does not block us — the app only ever sees HTTP
   `{z}/{x}/{y}.pbf`.
2. Use `OfflineManager.createPack({ mapStyle, bounds, minZoom, maxZoom })` —
   MapLibre's own offline mechanism. **Also implemented** — see
   `services/maps/offline-regions.ts` and §13 below; §4's tile server is what
   it downloads from.
3. Bundle raster tiles as files and use a `file://` raster source — not
   pursued, since option 1 was buildable without it.

The `none` mode (§3) is still the shipped default until `EXPO_PUBLIC_MAP_STYLE_URL`
is set; §4 is what to set it to.

## 6. Site Coordinates Are Customer Coordinates (Confirmed)

**Decision, confirmed 2026-09-09:** a Site's coordinates are the customer's
location. The map shows the customer's sites; tapping one opens the equipment
recorded inside that site. Equipment is located *by* its site and does not have
coordinates of its own.

This closes the question previously open here. `CLAUDE.md` §10 requires the
application to distinguish site coordinates from equipment coordinates, and it
now does so explicitly rather than by having two coordinate columns:
`MappedEquipment.positionSource` is `'site'`, recording that the position is
derived from the customer's location rather than measured on the equipment.

Consequences:

- `Equipment` gains **no** `latitude`/`longitude` columns. The domain model
  (`docs/domain-model.md` §5) stays as written and no migration is needed.
- All equipment at a site renders at the same point, which is correct — it is
  one customer location, not many.
- If a future requirement needs equipment placed inside a building (a specific
  wing or floor), `positionSource` becomes `'equipment'` for those records and
  the map needs no structural change.

## 7. Layering

```
app/(tabs)/map/index.tsx           route
features/maps/ui/                  MapScreen, useMapData          ← MapLibre lives here
features/maps/application/         load-map-data.ts, ports.ts
features/maps/domain/              map-features.ts, geojson.ts
        ↓ MapDataRepository, MapRegionRepository (interfaces)
database/repositories/             map-data-repository, map-region-repository
services/maps/                     tile-source.ts, style.ts       ← tiles and styles only
```

Verified constraints:

- No `@maplibre/*` import in any `domain/` or `application/` file.
- No SQL anywhere under `features/maps/`.
- `services/maps/` knows nothing about sites or equipment — it deals only with
  tiles and styles (`CLAUDE.md` §10).

## 8. The Six Distinctions Required by CLAUDE.md §10

| Distinction | Where it lives |
|---|---|
| Map tiles and styles | `services/maps/tile-source.ts`, `services/maps/style.ts` |
| Offline map regions | `map_regions` table, `MapRegionRepository` |
| Site coordinates | `sites.latitude` / `sites.longitude` → `MappedSite.coordinates` |
| Equipment coordinates | `MappedEquipment.coordinates` + `positionSource` (see §6) |
| Business attributes | `MappedSite` / `MappedEquipment` fields, `sites` and `equipment` tables |
| Local map cache state | `map_regions.download_status` / `download_progress` |

Business data and map cache state are read through **two separate ports** and
kept as separate fields all the way to the UI, which states in words that
downloading a map does not download sites or equipment.

## 9. Sites That Cannot Be Placed

A site with no coordinates is returned by the repository as an
`UnmappableSite`, not filtered out, and the screen names them in a banner.
Silently dropping them would make the map look complete while hiding data the
user captured (`CLAUDE.md` §6).

## 10. Tests

`npm test` — 141 tests across 12 suites, all passing. For maps specifically:

- `tests/features/maps/tile-source.test.ts` — the no-cloud guard, including
  subdomains, OpenFreeMap's own hosted endpoints, and that the shipped
  default configures no basemap.
- `tests/features/maps/style.test.ts` — the background-only *fallback* style
  is valid, declares no sources, and declares neither `glyphs` nor `sprite`
  (the self-hosted Liberty style, which does declare both, is built inside
  `tileserver/` and covered there).
- `tileserver/` (`npm test`, `node --test`) — `src/mbtiles.test.ts` covers
  the MBTiles reader: metadata parsing, the TMS→XYZ row flip, gzip
  pass-through, and missing-tile `null`.
- `tests/features/maps/map-features.test.ts` — coordinate validation, bounds,
  centre, per-site equipment.
- `tests/features/maps/geojson.test.ts` — longitude-first ordering, feature ids,
  primitive-only properties.
- `tests/features/maps/load-map-data.test.ts` — business data and cache state
  stay separate; failures reported, not thrown.
- `tests/features/maps/MapScreen.test.tsx` — loading, error+retry, empty,
  GeoJSON handed to the map, inline style (never a remote URL), unmappable-site
  banner, selection and equipment detail, cache state.

MapLibre is mocked in the screen test: it binds to native code and cannot
render under Jest. The mock records the props the screen passes, which is
enough to assert what the screen is responsible for, and does not pretend the
native renderer ran.

**Repository SQL is verified separately** by executing the statements extracted
from the repository files against SQLite with the migration-001 schema. This
caught a real bug: with a `LEFT JOIN`, a site with no equipment still produces
one row whose `e.quantity` is NULL, so `COALESCE(e.quantity, 1)` counted a
phantom unit and every empty site reported 1 unit instead of 0. The query now
tests `e.id IS NULL` to distinguish "no equipment" from "equipment of unknown
quantity".

## 11. What Still Needs a Device

The OpenFreeMap basemap, its glyphs and sprites, and `OfflineManager.createPack`
against it were all verified on a Pixel dev client (§4 "Status"). Still open:

- Street-name labels (`transportation_name`) at the very top zooms — place
  and city labels were confirmed; a close-in check of an individual road
  name has not been done.
- Tap hit-testing on circle layers — the screen test simulates the press
  event, it does not verify MapLibre's hitbox behaviour. (Site selection
  itself *was* exercised on device.)
- Performance with a realistic number of sites. There is still no clustering.

## 12. Not Implemented

- 3D terrain / hillshade — the `ne2_shaded` Natural Earth raster source is
  dropped from the served style (§4).
- User location, camera-follow, clustering.
- Any area outside Brazil / Panamá: add a Geofabrik area name to
  `PLANETILER_AREAS` for `build-tiles`, plus a `PREDEFINED_REGIONS` entry in
  `features/maps/domain/predefined-regions.ts` if it should be downloadable.

## 13. Offline Region Downloads (Implemented)

`services/maps/offline-regions.ts` wraps MapLibre's `OfflineManager`, which is
alternative 2 from §5 — the one the installed library actually supports.

- `canDownloadRegions()` returns `unavailable / no_basemap` when no self-hosted
  style is configured. With no tiles there is nothing to fetch, so the code
  refuses rather than starting a download that silently does nothing.
- A style URL pointing at a third-party provider is refused as
  `unavailable / invalid_style`, so the no-cloud rule holds on this path too.
- Progress arrives as a 0–1 fraction, clamped; failures are surfaced through
  `onError` so they can be written to `map_regions.last_error` and retried
  (`docs/offline-sync.md` §6).
- `MapRegionRepository` gained `upsertRegion` and `updateRegionStatus`. The
  region row is written **before** the download starts, so a download
  interrupted by the app closing leaves a row in `downloading` rather than no
  trace at all.
- `upsertRegion` uses `INSERT ... ON CONFLICT (id) DO UPDATE`, so re-downloading
  a region updates its row instead of duplicating it.
- `updateRegionStatus` uses `COALESCE` for `size_bytes` and `downloaded_at`, so
  a progress update does not erase values an earlier update established.

Verified against real SQLite with the migration-001 schema: the bounds→lat/lon
column mapping, the upsert-not-duplicate behaviour, the COALESCE retention, and
that the `download_status` and `download_progress` CHECK constraints still
reject invalid values. Ten Jest tests cover the service itself.

**Verified on-device once** (2026-09-10) against the *previous* `geojson-vt`
tile server: pressing the "Descargar" button that
`features/maps/ui/MapScreen.tsx` shows for each `not_downloaded`/`failed`
predefined region (`features/maps/domain/predefined-regions.ts`) drove both
the Sao Paulo and Ciudad de Panamá packs from `not_downloaded` to
`downloaded`, with five concurrent connections from the phone observed
during the download. The download **code is unchanged** by the §4 pipeline
switch and its Jest tests still pass, but this needs re-running against the
new `.mbtiles`-backed server, which also serves glyph and sprite requests a
pack must fetch (§11). `features/maps/application/download-region.ts` is the orchestrator
that writes the `map_regions` row before starting and translates
progress/error callbacks into `updateRegionStatus` calls;
`features/maps/application/seed-predefined-regions.ts` is what first
populates the four rows (Brazil, Panamá, Sao Paulo, Ciudad de Panamá) so the
button has something to act on before any download has run
(`lib/demo-seed.ts` calls it once a local user exists).

## 14. Search Bar for Downloadable Regions (Implemented)

`MapScreen` shows a search field above the map
(`features/maps/ui/MapScreen.tsx`, `map-region-search-input`). It is the
**only** region browser on the screen — the separate "Regiones de mapa
descargadas" list further down the panel was removed (2026-09-10) once the
search area covered the same ground, and keeping both was redundant.

**Per explicit product decision, results show only once the user searches.**
With an empty query, the panel below the map shows nothing but the
site-count indicator ("N sitio(s) en el mapa" / the selected site's detail)
— no region names sit on screen unasked. Typing filters the region rows
already loaded by `useMapData` to a case-insensitive substring match on name
and shows each match's live status (`not_downloaded` / `downloading` with a
percentage / `downloaded` / `failed` with its error) and a "Descargar" button
where applicable. Clearing the query hides the results again.

**What this searches today:** only `PREDEFINED_REGIONS`
(`features/maps/domain/predefined-regions.ts`), the same fixed, hardcoded
catalog §12 already documents — four regions, seeded locally. There is no
server-backed map catalog yet (see §15).

## 15. Planned: Server-Centralized Map Catalog, Coupled to Observation Downloads (Not Implemented)

**Product decision, not yet built:** the catalog of downloadable maps is
meant to move from the hardcoded `PREDEFINED_REGIONS` list to one centralized
on a server — "available maps" become a server-owned resource, not a
constant shipped in the app bundle. Business data centralization already
follows the same shape: the local SQLite database is the source of truth
while offline, and the server is the source of truth for the synchronized
dataset (`CLAUDE.md` §3).

**Downloading a map region will also download the observation data tied to
the chosen country or city.** Today the app enforces the opposite on
purpose — regions and business data are two separate ports
(`MapDataRepository` vs. `MapRegionRepository`, §8 above) and downloading a
region downloads no sites or equipment. That separation stays true for the
*local* dataset a device already holds. What changes here is what a *fresh*
region download does: pulling in a map pack for, say, Panamá becomes the way
a device also pulls in the observations recorded for sites in Panamá,
scoped by the same country/city the region covers, rather than requiring a
second, separate sync step to get business data for a place the user just
downloaded a map for.

This is **not implemented**. Nothing described in this section exists yet:
there is no server-hosted map catalog, no endpoint serving it, and no code
path that downloads observations alongside a region. Implementing it needs,
at minimum:

- An endpoint the app can query for the current list of downloadable regions
  (replacing `PREDEFINED_REGIONS` as the source of truth, or seeding it from
  the server instead of a local constant).
- A way to scope observation records by country/city for a bundled download,
  distinct from the existing `POST /v1/sync` upload path
  (`docs/sync-api.md`), since that path is upload-only — the *download*
  direction for synchronization is itself still an open item (`CLAUDE.md`
  §18, `docs/sync-api.md` §2).
- A decision on whether this server is the existing sync backend
  (`docs/tech-stack.md` §5: Node.js + PostgreSQL) extended with a map-catalog
  endpoint, or a separate service alongside `tileserver/` (which today only
  serves tiles, not a region catalog or business data).

**Per explicit product instruction: when implementation of this server
begins, the technology stack for it must be confirmed with the product owner
before any code is written** — this is not to be decided unilaterally, even
though `docs/tech-stack.md` §5 already names Node.js + PostgreSQL for the
existing sync backend. Whether this reuses that backend or is a new service
is itself part of what needs confirming.
