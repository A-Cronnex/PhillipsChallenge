import {
  assertSelfHostedStyleUrl,
  CloudTileProviderError,
  basemapConfig,
} from '../../../services/maps/tile-source';

/**
 * The no-cloud rule in docs/tech-stack.md §4a is the constraint most likely to
 * be broken by accident — a demo style URL pasted in and forgotten. These
 * tests exist to make that fail loudly.
 */
describe('assertSelfHostedStyleUrl', () => {
  it.each([
    'https://api.maptiler.com/maps/streets/style.json?key=abc',
    'https://tiles.stadiamaps.com/styles/alidade_smooth.json',
    'https://api.mapbox.com/styles/v1/mapbox/streets-v12',
    'https://demotiles.maplibre.org/style.json',
    'https://tile.openstreetmap.org/style.json',
    'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  ])('rejects %s', (url) => {
    expect(() => assertSelfHostedStyleUrl(url)).toThrow(CloudTileProviderError);
  });

  it('rejects a subdomain of a forbidden provider', () => {
    expect(() =>
      assertSelfHostedStyleUrl('https://cdn.api.maptiler.com/style.json')
    ).toThrow(CloudTileProviderError);
  });

  it('names the provider and the rule in the error message', () => {
    expect(() =>
      assertSelfHostedStyleUrl('https://api.maptiler.com/style.json')
    ).toThrow(/maptiler\.com.*self-hosted/s);
  });

  it('accepts a style served from the project’s own backend', () => {
    expect(() =>
      assertSelfHostedStyleUrl('https://tiles.internal.example.org/style.json')
    ).not.toThrow();
  });

  it('accepts a style bundled with the app as a file URL', () => {
    expect(() =>
      assertSelfHostedStyleUrl('file:///android_asset/panama/style.json')
    ).not.toThrow();
  });

  it('ignores a value that is not a URL at all', () => {
    expect(() => assertSelfHostedStyleUrl('./assets/style.json')).not.toThrow();
  });
});

describe('basemapConfig', () => {
  it('ships with no basemap configured, so no cloud call can happen by default', () => {
    expect(basemapConfig.mode).toBe('none');
    expect(basemapConfig.styleUrl).toBeUndefined();
  });
});
