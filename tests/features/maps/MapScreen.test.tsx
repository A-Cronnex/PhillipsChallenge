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
import { PREDEFINED_REGIONS } from '../../../features/maps/domain/predefined-regions';

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

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

/** A press on the sites GeoJSONSource, shaped like the real NativeSyntheticEvent MapScreen calls stopPropagation() on. */
function sitePressEvent(siteId: string) {
  return {
    stopPropagation: jest.fn(),
    nativeEvent: { features: [{ properties: { siteId } }] },
  };
}

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
  // A real Map, not a frozen array: the download button reads and writes
  // this through upsertRegion/updateRegionStatus, and useMapData re-reads it
  // via listRegions — this fake needs to behave like the table those calls
  // share, not like a fixture that never changes.
  const regionRows = new Map((options.regions ?? []).map((region) => [region.id, region]));

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
    mapRegions: {
      listRegions: async () => [...regionRows.values()],
      upsertRegion: async (region: MapRegion) => {
        regionRows.set(region.id, region);
      },
      updateRegionStatus: async (
        id: string,
        update: {
          status: MapRegion['status'];
          progress: number;
          lastError?: string | null;
          sizeBytes?: number | null;
          downloadedAt?: string | null;
        }
      ) => {
        const existing = regionRows.get(id);
        if (!existing) return;
        regionRows.set(id, {
          ...existing,
          status: update.status,
          progress: update.progress,
          lastError: update.lastError ?? existing.lastError,
          sizeBytes: update.sizeBytes ?? existing.sizeBytes,
          downloadedAt: update.downloadedAt ?? existing.downloadedAt,
        });
      },
    },
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

beforeEach(() => {
  mockGetRepositories.mockReset();
  mockPush.mockReset();
});

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

    fireEvent(screen.getByTestId('mock-geojson-source'), 'press', sitePressEvent('site-1'));

    await waitFor(() => expect(screen.getByTestId('site-detail')).toBeTruthy());
    expect(screen.getByText('Hospital Example')).toBeTruthy();
    expect(screen.getByText('Philips IntelliVue')).toBeTruthy();
    // docs/maps.md §6: stated once for the site, not repeated per equipment row.
    expect(
      screen.getByText(/Equipos ubicados en las coordenadas del sitio del cliente/)
    ).toBeTruthy();
  });

  it('stops a site press from bubbling to the map and clearing the selection', async () => {
    // @maplibre/maplibre-react-native documents that a Source press bubbles
    // to the Map's own onPress unless event.stopPropagation() is called —
    // without it, selecting a site immediately triggers
    // onPress={map.clearSelection} on the Map right after, so nothing ever
    // stays selected. This can't be reproduced end-to-end against the mocked
    // Map (it does not simulate real bubbling), so this asserts the one
    // thing that determines the real behaviour: the handler calls it.
    mockGetRepositories.mockResolvedValue(
      repositories({ dataset: { sites: [SITE], equipment: [EQUIPMENT] } })
    );
    render(<MapScreen />);
    await waitFor(() => expect(screen.getByTestId('maplibre-map')).toBeTruthy());

    const event = sitePressEvent('site-1');
    fireEvent(screen.getByTestId('mock-geojson-source'), 'press', event);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('site-detail')).toBeTruthy());
  });

  it('widens the map source hitbox beyond the smallest circle radius', async () => {
    mockGetRepositories.mockResolvedValue(
      repositories({ dataset: { sites: [SITE] } })
    );
    render(<MapScreen />);

    await waitFor(() => expect(screen.getByTestId('maplibre-map')).toBeTruthy());
    const hitbox = screen.getByTestId('mock-geojson-source').props.hitbox;
    expect(hitbox.top).toBeGreaterThanOrEqual(24);
    expect(hitbox.bottom).toBeGreaterThanOrEqual(24);
    expect(hitbox.left).toBeGreaterThanOrEqual(24);
    expect(hitbox.right).toBeGreaterThanOrEqual(24);
  });

  it('opens the observation history for the selected site', async () => {
    mockGetRepositories.mockResolvedValue(
      repositories({ dataset: { sites: [SITE], equipment: [EQUIPMENT] } })
    );
    render(<MapScreen />);
    await waitFor(() => expect(screen.getByTestId('maplibre-map')).toBeTruthy());

    fireEvent(screen.getByTestId('mock-geojson-source'), 'press', sitePressEvent('site-1'));
    await waitFor(() => expect(screen.getByTestId('site-detail')).toBeTruthy());

    fireEvent.press(screen.getByTestId('view-observations'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/site/[siteId]',
      params: { siteId: 'site-1' },
    });
  });

  it('clears the selection', async () => {
    mockGetRepositories.mockResolvedValue(
      repositories({ dataset: { sites: [SITE], equipment: [EQUIPMENT] } })
    );
    render(<MapScreen />);

    await waitFor(() => expect(screen.getByTestId('maplibre-map')).toBeTruthy());
    fireEvent(screen.getByTestId('mock-geojson-source'), 'press', sitePressEvent('site-1'));
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

  it('offers to download a not-yet-downloaded region, and not a downloading one', async () => {
    const predefined = PREDEFINED_REGIONS[0];
    mockGetRepositories.mockResolvedValue(
      repositories({
        dataset: { sites: [SITE] },
        regions: [
          {
            id: predefined.id,
            name: predefined.name,
            bounds: predefined.bounds,
            status: 'not_downloaded',
            progress: 0,
            lastError: null,
            sizeBytes: null,
            downloadedAt: null,
          },
          {
            id: 'r-downloading',
            name: 'En curso',
            bounds: [-83, 7, -77, 10],
            status: 'downloading',
            progress: 0.1,
            lastError: null,
            sizeBytes: null,
            downloadedAt: null,
          },
        ],
      })
    );
    render(<MapScreen />);

    await waitFor(() =>
      expect(screen.getByTestId(`download-region-${predefined.id}`)).toBeTruthy()
    );
    expect(screen.queryByTestId('download-region-r-downloading')).toBeNull();
  });

  it('pressing Descargar starts the download and reflects its outcome', async () => {
    const predefined = PREDEFINED_REGIONS[0];
    mockGetRepositories.mockResolvedValue(
      repositories({
        dataset: { sites: [SITE] },
        regions: [
          {
            id: predefined.id,
            name: predefined.name,
            bounds: predefined.bounds,
            status: 'not_downloaded',
            progress: 0,
            lastError: null,
            sizeBytes: null,
            downloadedAt: null,
          },
        ],
      })
    );
    render(<MapScreen />);

    await waitFor(() =>
      expect(screen.getByTestId(`download-region-${predefined.id}`)).toBeTruthy()
    );
    fireEvent.press(screen.getByTestId(`download-region-${predefined.id}`));

    // No self-hosted style is configured in this test environment
    // (EXPO_PUBLIC_MAP_STYLE_URL is unset), so the real
    // services/maps/offline-regions.ts refuses the download — the row must
    // land on `failed`, not disappear or stay stuck on `downloading`.
    const escapedName = predefined.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`${escapedName} — failed`))).toBeTruthy()
    );
    // Retryable: the button comes back once the region is failed.
    expect(screen.getByTestId(`download-region-${predefined.id}`)).toBeTruthy();
  });
});
