import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { View } from 'react-native';

import { MapScreen } from '../../../features/maps/ui/MapScreen';
import type { Repositories } from '../../../lib/container';
import type {
  MapDataset,
  MappedEquipment,
  MappedSite,
} from '../../../features/maps/domain/map-features';
import type { MapRegion } from '../../../features/maps/application/ports';

/**
 * MapLibre binds to native code and cannot render under Jest, so the map
 * components are replaced with plain views that record the props the screen
 * passes them. That is enough to assert what this screen is responsible for —
 * which data reaches the map and which states are presented — without
 * pretending the native renderer ran. Actual rendering needs a device.
 */
jest.mock('@maplibre/maplibre-react-native', () => {
  const { View: RNView } = require('react-native');
  const React = require('react');
  const passthrough = (name: string) =>
    function MockMapComponent(props: Record<string, unknown>) {
      return React.createElement(
        RNView,
        { testID: props.testID ?? `mock-${name}`, ...props },
        props.children as React.ReactNode
      );
    };
  return {
    Map: passthrough('map'),
    Camera: passthrough('camera'),
    GeoJSONSource: passthrough('geojson-source'),
    Layer: passthrough('layer'),
  };
});

const mockGetRepositories = jest.fn();
jest.mock('../../../lib/container', () => ({
  getRepositories: () => mockGetRepositories(),
}));

const SITE: MappedSite = {
  siteId: 'site-1',
  name: 'Hospital Example',
  city: 'Panama City',
  country: 'Panama',
  coordinates: { longitude: -79.52, latitude: 8.98 },
  equipmentCount: 1,
  equipmentUnitCount: 5,
  modalities: ['Monitor'],
};

const EQUIPMENT: MappedEquipment = {
  equipmentId: 'eq-1',
  siteId: 'site-1',
  brand: 'Philips',
  model: 'IntelliVue',
  modality: 'Monitor',
  quantity: 5,
  installationYear: 2018,
  coordinates: { longitude: -79.52, latitude: 8.98 },
  positionSource: 'site',
};

function repositories(options: {
  dataset?: Partial<MapDataset>;
  regions?: MapRegion[];
  error?: Error;
}): Repositories {
  return {
    mapData: {
      async loadMapDataset() {
        if (options.error) throw options.error;
        return {
          sites: [],
          equipment: [],
          unmappableSites: [],
          ...options.dataset,
        };
      },
    },
    mapRegions: { listRegions: async () => options.regions ?? [] },
    // The map must never touch capture or auth.
    observations: {
      save: () => {
        throw new Error('map must not write observations');
      },
    },
    sites: {
      listSites: () => {
        throw new Error('map uses mapData, not the capture site port');
      },
    },
    users: {
      getCurrentUser: () => {
        throw new Error('map must not read the current user');
      },
    },
  } as unknown as Repositories;
}

beforeEach(() => mockGetRepositories.mockReset());

describe('MapScreen', () => {
  it('shows a loading state while local data is read', () => {
    mockGetRepositories.mockReturnValue(new Promise(() => {}));
    render(<MapScreen />);

    expect(screen.getByTestId('loading-state')).toBeTruthy();
  });

  it('shows a retryable error state when local data cannot be read', async () => {
    mockGetRepositories.mockResolvedValue(
      repositories({ error: new Error('database is locked') })
    );
    render(<MapScreen />);

    await waitFor(() => expect(screen.getByTestId('error-state')).toBeTruthy());
    expect(screen.getByText('database is locked')).toBeTruthy();

    mockGetRepositories.mockResolvedValue(
      repositories({ dataset: { sites: [SITE] } })
    );
    fireEvent.press(screen.getByTestId('retry-button'));
    await waitFor(() => expect(screen.getByTestId('maplibre-map')).toBeTruthy());
  });

  it('shows an empty state when no sites are stored locally', async () => {
    mockGetRepositories.mockResolvedValue(repositories({}));
    render(<MapScreen />);

    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeTruthy());
    expect(screen.getByText('No hay sitios guardados')).toBeTruthy();
  });

  it('renders the map when there are sites to place', async () => {
    mockGetRepositories.mockResolvedValue(
      repositories({ dataset: { sites: [SITE] } })
    );
    render(<MapScreen />);

    await waitFor(() => expect(screen.getByTestId('maplibre-map')).toBeTruthy());
    expect(screen.getByText('1 sitio(s) en el mapa')).toBeTruthy();
  });

  it('hands the map an inline style, never a remote url, by default', async () => {
    mockGetRepositories.mockResolvedValue(
      repositories({ dataset: { sites: [SITE] } })
    );
    render(<MapScreen />);

    await waitFor(() => expect(screen.getByTestId('maplibre-map')).toBeTruthy());
    const mapStyle = screen.getByTestId('maplibre-map').props.mapStyle;
    expect(typeof mapStyle).toBe('object');
    expect(mapStyle.version).toBe(8);
    expect(mapStyle.sources).toEqual({});
  });

  it('passes the sites to the map as a GeoJSON feature collection', async () => {
    mockGetRepositories.mockResolvedValue(
      repositories({ dataset: { sites: [SITE] } })
    );
    render(<MapScreen />);

    await waitFor(() => expect(screen.getByTestId('maplibre-map')).toBeTruthy());
    const data = screen.getByTestId('mock-geojson-source').props.data;
    expect(data.type).toBe('FeatureCollection');
    expect(data.features).toHaveLength(1);
    expect(data.features[0].geometry.coordinates).toEqual([-79.52, 8.98]);
  });

  it('tells the user when no self-hosted basemap is configured', async () => {
    mockGetRepositories.mockResolvedValue(
      repositories({ dataset: { sites: [SITE] } })
    );
    render(<MapScreen />);

    await waitFor(() => expect(screen.getByTestId('no-basemap')).toBeTruthy());
  });

  it('reports sites that cannot be placed rather than hiding them', async () => {
    mockGetRepositories.mockResolvedValue(
      repositories({
        dataset: {
          sites: [SITE],
          unmappableSites: [
            {
              siteId: 'site-2',
              name: 'Clínica Sin Coordenadas',
              reason: 'missing_coordinates',
            },
          ],
        },
      })
    );
    render(<MapScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('unmappable-sites')).toBeTruthy()
    );
    expect(screen.getByText(/Clínica Sin Coordenadas/)).toBeTruthy();
  });

  it('shows the equipment of a selected site, located at the customer site', async () => {
    mockGetRepositories.mockResolvedValue(
      repositories({ dataset: { sites: [SITE], equipment: [EQUIPMENT] } })
    );
    render(<MapScreen />);

    await waitFor(() => expect(screen.getByTestId('maplibre-map')).toBeTruthy());

    fireEvent(screen.getByTestId('mock-geojson-source'), 'press', {
      nativeEvent: { features: [{ properties: { siteId: 'site-1' } }] },
    });

    await waitFor(() => expect(screen.getByTestId('site-detail')).toBeTruthy());
    expect(screen.getByText('Hospital Example')).toBeTruthy();
    expect(screen.getByText('Philips IntelliVue')).toBeTruthy();
    // docs/maps.md §6: stated once for the site, not repeated per equipment row.
    expect(
      screen.getByText(/Equipos ubicados en las coordenadas del sitio del cliente/)
    ).toBeTruthy();
  });

  it('clears the selection', async () => {
    mockGetRepositories.mockResolvedValue(
      repositories({ dataset: { sites: [SITE], equipment: [EQUIPMENT] } })
    );
    render(<MapScreen />);

    await waitFor(() => expect(screen.getByTestId('maplibre-map')).toBeTruthy());
    fireEvent(screen.getByTestId('mock-geojson-source'), 'press', {
      nativeEvent: { features: [{ properties: { siteId: 'site-1' } }] },
    });
    await waitFor(() => expect(screen.getByTestId('site-detail')).toBeTruthy());

    fireEvent.press(screen.getByTestId('clear-selection'));
    await waitFor(() => expect(screen.getByTestId('map-summary')).toBeTruthy());
  });

  it('shows map cache state separately from business data', async () => {
    mockGetRepositories.mockResolvedValue(
      repositories({ dataset: { sites: [SITE] }, regions: [] })
    );
    render(<MapScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('map-cache-state')).toBeTruthy()
    );
    // A site is present but no region is downloaded — the two must not be
    // conflated (CLAUDE.md §10).
    expect(screen.getByText('Ninguna región descargada.')).toBeTruthy();
    expect(
      screen.getByText(/descargar un mapa no descarga sitios ni equipos/)
    ).toBeTruthy();
  });

  it('shows a downloading region with its progress', async () => {
    mockGetRepositories.mockResolvedValue(
      repositories({
        dataset: { sites: [SITE] },
        regions: [
          {
            id: 'r1',
            name: 'Panamá',
            bounds: [-83, 7, -77, 10],
            status: 'downloading',
            progress: 0.42,
            lastError: null,
            sizeBytes: null,
            downloadedAt: null,
          },
        ],
      })
    );
    render(<MapScreen />);

    await waitFor(() =>
      expect(screen.getByText(/Panamá — downloading \(42%\)/)).toBeTruthy()
    );
  });
});
