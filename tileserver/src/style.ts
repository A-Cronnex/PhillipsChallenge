/**
 * The MapLibre style this server serves at `/styles/self-hosted.json`.
 *
 * Deliberately declares no `glyphs` and no `sprite`, and every layer here is
 * `fill` or `line` — no `symbol` layer. That mirrors the rule the app's own
 * `services/maps/style.ts` documents for the background-only style: a hosted
 * glyph/sprite endpoint is the usual way a "self-hosted" style quietly grows
 * a cloud dependency, and this server has no such endpoint to offer.
 * Labels, if ever wanted, are drawn as React views by the app screen, not by
 * this style (docs/maps.md §3).
 */
export function buildStyle(baseUrl: string) {
  const tilesUrl = `${baseUrl}/tiles/{z}/{x}/{y}.pbf`;

  return {
    version: 8,
    sources: {
      demo: {
        type: 'vector',
        tiles: [tilesUrl],
        minzoom: 0,
        maxzoom: 15,
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#E8E6E1' } },
      {
        id: 'landuse',
        type: 'fill',
        source: 'demo',
        'source-layer': 'landuse',
        paint: { 'fill-color': '#D9E4C8', 'fill-opacity': 0.6 },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'demo',
        'source-layer': 'water',
        paint: { 'fill-color': '#A9CDE0' },
      },
      {
        id: 'country-boundaries',
        type: 'line',
        source: 'demo',
        'source-layer': 'country_boundaries',
        paint: { 'line-color': '#9A8C7A', 'line-width': 1.5, 'line-dasharray': [2, 2] },
      },
      {
        id: 'roads',
        type: 'line',
        source: 'demo',
        'source-layer': 'roads',
        minzoom: 9,
        paint: {
          'line-color': '#FFFFFF',
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 16, 3],
        },
      },
    ],
  };
}
