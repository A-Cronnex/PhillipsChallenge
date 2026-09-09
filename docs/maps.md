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
  tile URLs inside that document, so those must be project-owned too.

The style declares no `glyphs` and no `sprite` entry. That is deliberate:
hosted glyph and sprite endpoints are the usual back door through which a cloud
dependency re-enters a nominally self-hosted style. The consequence is that
**no text-rendering layer can be used** — labels are drawn as React views
instead.

## 4. Generating Tiles (Not Done Here)

No tile file is produced by this repository. When the basemap is wanted:

1. Take an OpenStreetMap extract for the region (e.g. Panama) from a source
   such as Geofabrik.
2. Generate vector tiles with Protomaps (`.pmtiles`) or the OpenMapTiles
   toolchain (`.mbtiles`).
3. Author a MapLibre style referencing those tiles, plus self-hosted glyphs and
   sprites if labels are needed.
4. Either bundle the output with the app or serve it from the project's own
   backend, then set `basemapConfig` accordingly.

## 5. Known Limitation: `.pmtiles` Is Not Directly Loadable

`docs/tech-stack.md` §4a names Protomaps `.pmtiles` as a distribution format,
but **`@maplibre/maplibre-react-native` 11.3.10 has no PMTiles or MBTiles
support** — verified by inspecting the installed package, which contains no
reference to either format. A `pmtiles://` URL will not load.

This is a real gap between the documented plan and what the library does. The
options, none of which are decided:

1. Serve tiles over HTTP from the project's own backend (a small server reading
   the `.pmtiles`/`.mbtiles` file and returning `z/x/y` tiles). Keeps the
   generation toolchain and stays self-hosted, but requires connectivity to the
   backend unless combined with option 3.
2. Use `OfflineManager.createPack({ mapStyle, bounds, minZoom, maxZoom })` —
   MapLibre's own offline mechanism, which downloads tiles from a style URL
   into its local cache. This is the supported offline path and works against a
   self-hosted style, satisfying §4a. **This is the alternative that was
   implemented** — see `services/maps/offline-regions.ts` and §13 below.
3. Bundle raster tiles as files and use a `file://` raster source, trading
   vector styling for zero infrastructure.

Nothing in the code pretends `.pmtiles` works. Until this is decided the
`none` mode is the honest default.

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
  subdomains, and that the shipped default configures no basemap.
- `tests/features/maps/style.test.ts` — the background-only style is valid,
  declares no sources, and declares neither `glyphs` nor `sprite`.
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

- Any actual map rendering. Nothing in CI has drawn a single pixel.
- The config plugin's native output (`expo prebuild` has not been run here).
- Tap hit-testing on circle layers — the screen test simulates the press event,
  it does not verify MapLibre's hitbox behaviour.
- Performance with a realistic number of sites. There is no clustering; it was
  left out because cluster counts need text, and text needs glyphs (§3).

## 12. Not Implemented

- Any basemap at all, pending the tile-source decision in §5. Region download
  is implemented but correctly refuses to run without one (§13).
- Clustering, labels, user location, camera-follow.
- A UI control to start a region download. The service and persistence exist;
  no button calls them yet, because with `mode: 'none'` there is nothing to
  download and a disabled button would be the whole feature.

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

Still needs a device (§11): nothing has actually downloaded a tile, and it
cannot until a self-hosted style URL exists.
