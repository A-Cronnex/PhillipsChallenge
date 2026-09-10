/**
 * Basemap tile source configuration.
 *
 * Hard constraint (docs/tech-stack.md §4a): no third-party map SaaS. No
 * MapTiler, Stadia, Mapbox or any other hosted tile provider may appear here,
 * including "just for development" — an API key in a style URL is a runtime
 * cloud dependency regardless of how the map behaves once cached.
 *
 * Tiles are generated offline from OpenStreetMap extracts with Protomaps or
 * the OpenMapTiles toolchain and distributed either bundled with the app or
 * served from the project's own backend (docs/offline-sync.md §12).
 */

/**
 * How the basemap is obtained.
 *
 * - `none` — no basemap at all. The map renders sites and equipment on a plain
 *   background. This is the default because it is the only mode that works
 *   with zero infrastructure, and it is genuinely offline rather than
 *   pretending to be.
 * - `self_hosted_style` — a MapLibre style document served by the project's
 *   own backend, or bundled as a local file. The style is responsible for
 *   pointing at the project's own tile endpoints.
 */
export type BasemapMode = 'none' | 'self_hosted_style';

export interface BasemapConfig {
  mode: BasemapMode;
  /**
   * Style document location when `mode` is `self_hosted_style`: an
   * `https://` URL on the project's own backend, or an absolute `file://`
   * URL for a style bundled with the app.
   *
   * MapLibre resolves the tile URLs inside this document, so those must also
   * point at project-owned infrastructure.
   */
  styleUrl?: string;
}

/**
 * Hosts that must never appear in a basemap style URL.
 *
 * Checked at runtime rather than trusted to review: a style URL is exactly the
 * kind of value that gets pasted in during a demo and forgotten.
 */
const FORBIDDEN_TILE_HOSTS = [
  'maptiler.com',
  'stadiamaps.com',
  'mapbox.com',
  'maptiler.link',
  'thunderforest.com',
  'carto.com',
  'cartocdn.com',
  'openstreetmap.org',
  'demotiles.maplibre.org',
];

export class CloudTileProviderError extends Error {
  constructor(url: string, host: string) {
    super(
      `Basemap style "${url}" points at ${host}, a third-party tile provider. ` +
        `docs/tech-stack.md §4a requires self-hosted tiles only.`
    );
    this.name = 'CloudTileProviderError';
  }
}

/**
 * Rejects a style URL that points at a known hosted tile provider.
 *
 * `openstreetmap.org` is on the list too: the public OSM tile servers are a
 * third-party runtime dependency and their tile usage policy forbids this kind
 * of use anyway.
 */
export function assertSelfHostedStyleUrl(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    // A non-URL value is a bundled file path; nothing to check.
    return;
  }

  const match = FORBIDDEN_TILE_HOSTS.find(
    (forbidden) => host === forbidden || host.endsWith(`.${forbidden}`)
  );
  if (match) throw new CloudTileProviderError(url, match);
}

/**
 * The active configuration.
 *
 * Defaults to `none`. Point it at the project's own style once tiles are
 * generated and served — see docs/maps.md §4.
 */
const styleUrl = process.env.EXPO_PUBLIC_MAP_STYLE_URL?.trim();
export const basemapConfig: BasemapConfig = styleUrl ? { mode: 'self_hosted_style', styleUrl } : { mode: 'none' };
