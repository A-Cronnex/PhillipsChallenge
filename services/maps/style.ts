/**
 * Builds the MapLibre style document.
 *
 * Map tiles and styles are kept separate from business data (CLAUDE.md §10):
 * this module knows nothing about sites or equipment. Those are added as
 * GeoJSON sources and layers by the map screen, on top of whatever base style
 * this returns.
 */
import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import {
  assertSelfHostedStyleUrl,
  basemapConfig,
  type BasemapConfig,
} from './tile-source';

/** Layer id the business-data layers are inserted above. */
export const BACKGROUND_LAYER_ID = 'background';

/**
 * A valid style with no tile sources whatsoever.
 *
 * Deliberately not a stub: a style containing only a background layer is a
 * complete, renderable MapLibre style. It makes zero network requests, so the
 * map is genuinely usable on a device that has never had connectivity — the
 * user sees their sites positioned relative to one another, without street
 * detail.
 *
 * No `glyphs` entry is declared, which means no text-rendering layers can be
 * used. That is intentional: hosted glyph endpoints are the usual back door
 * through which a cloud dependency re-enters a "self-hosted" style. Labels are
 * drawn as React views instead.
 */
export function backgroundOnlyStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: BACKGROUND_LAYER_ID,
        type: 'background',
        paint: { 'background-color': '#E8E6E1' },
      },
    ],
  };
}

/**
 * Resolves the style to hand to the map.
 *
 * Returns a `StyleSpecification` when there is no basemap, or the configured
 * self-hosted style URL for MapLibre to fetch. Throws if the configured URL
 * points at a third-party provider.
 */
export function resolveMapStyle(
  config: BasemapConfig = basemapConfig
): StyleSpecification | string {
  if (config.mode === 'none') return backgroundOnlyStyle();

  if (!config.styleUrl) {
    throw new Error(
      'Basemap mode is "self_hosted_style" but no styleUrl was configured.'
    );
  }

  assertSelfHostedStyleUrl(config.styleUrl);
  return config.styleUrl;
}

/** Whether the current configuration draws a basemap at all. */
export function hasBasemap(config: BasemapConfig = basemapConfig): boolean {
  return config.mode !== 'none';
}
