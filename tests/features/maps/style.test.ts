import {
  BACKGROUND_LAYER_ID,
  backgroundOnlyStyle,
  hasBasemap,
  resolveMapStyle,
} from '../../../services/maps/style';
import { CloudTileProviderError } from '../../../services/maps/tile-source';

describe('backgroundOnlyStyle', () => {
  it('is a valid style spec version 8', () => {
    expect(backgroundOnlyStyle().version).toBe(8);
  });

  it('declares no sources, so it makes no network request', () => {
    expect(backgroundOnlyStyle().sources).toEqual({});
  });

  it('declares a single background layer', () => {
    const layers = backgroundOnlyStyle().layers;
    expect(layers).toHaveLength(1);
    expect(layers[0].id).toBe(BACKGROUND_LAYER_ID);
    expect(layers[0].type).toBe('background');
  });

  it('declares no glyphs endpoint, which would be a cloud dependency', () => {
    expect(backgroundOnlyStyle()).not.toHaveProperty('glyphs');
  });

  it('declares no sprite endpoint either', () => {
    expect(backgroundOnlyStyle()).not.toHaveProperty('sprite');
  });
});

describe('resolveMapStyle', () => {
  it('returns the inline style when no basemap is configured', () => {
    const style = resolveMapStyle({ mode: 'none' });
    expect(typeof style).toBe('object');
  });

  it('returns the configured self-hosted style url', () => {
    expect(
      resolveMapStyle({
        mode: 'self_hosted_style',
        styleUrl: 'https://tiles.internal.example.org/style.json',
      })
    ).toBe('https://tiles.internal.example.org/style.json');
  });

  it('refuses a third-party provider url', () => {
    expect(() =>
      resolveMapStyle({
        mode: 'self_hosted_style',
        styleUrl: 'https://api.maptiler.com/style.json',
      })
    ).toThrow(CloudTileProviderError);
  });

  it('fails loudly when a basemap is requested without a url', () => {
    expect(() => resolveMapStyle({ mode: 'self_hosted_style' })).toThrow(
      /no styleUrl was configured/
    );
  });
});

describe('hasBasemap', () => {
  it('is false when no basemap is configured', () => {
    expect(hasBasemap({ mode: 'none' })).toBe(false);
  });

  it('is true for a self-hosted style', () => {
    expect(
      hasBasemap({ mode: 'self_hosted_style', styleUrl: 'file:///style.json' })
    ).toBe(true);
  });
});
