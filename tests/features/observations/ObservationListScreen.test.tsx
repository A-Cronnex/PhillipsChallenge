import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ObservationListScreen } from '../../../features/observations/ui/ObservationListScreen';
import type { Repositories } from '../../../lib/container';
import type { ObservationRecord } from '../../../features/observations/domain/observation-record';
import type { SiteSummary } from '../../../features/sites/application/ports';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => <Text>{name}</Text> };
});

const mockGetRepositories = jest.fn();
jest.mock('../../../lib/container', () => ({
  getRepositories: () => mockGetRepositories(),
}));

const SITE: SiteSummary = {
  id: 'site-1',
  name: 'Hospital DemoCare Pacific',
  city: 'Panama City',
  country: 'Panama',
};

function observation(overrides: Partial<ObservationRecord> = {}): ObservationRecord {
  return {
    id: 'obs-1',
    equipmentId: 'eq-1',
    siteId: SITE.id,
    visitDate: '2026-08-18',
    quantity: 2,
    brand: 'NovaMed',
    model: 'NM-MR 700',
    modality: 'MR',
    estimatedYearsOfUse: 7,
    estimatedInstallationYear: 2019,
    operationalStatus: null,
    captureSource: 'voice',
    notes: 'Two MR systems observed in imaging area.',
    overallConfidence: 'high',
    createdBy: 'user-1',
    createdByName: 'Field User 01',
    createdAt: '2026-08-18T12:00:00.000Z',
    updatedAt: '2026-08-18T12:00:00.000Z',
    syncStatus: 'pending',
    ...overrides,
  };
}

function repositories(options: {
  site?: SiteSummary | null;
  observations?: ObservationRecord[];
  error?: Error;
}): Repositories {
  return {
    sites: {
      listSites: async () => [],
      getSite: async () => ('site' in options ? options.site! : SITE),
    },
    observations: {
      save: async () => {
        throw new Error('the list screen must not write observations');
      },
      listBySite: async () => {
        if (options.error) throw options.error;
        return options.observations ?? [observation()];
      },
    },
  } as unknown as Repositories;
}

beforeEach(() => {
  mockGetRepositories.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ObservationListScreen', () => {
  it('shows a loading state while the site and its observations are read', () => {
    mockGetRepositories.mockReturnValue(new Promise(() => {}));
    render(<ObservationListScreen siteId={SITE.id} />);
    expect(screen.getByTestId('loading-state')).toBeTruthy();
  });

  it('shows the site as the primary heading, with country/city as secondary', async () => {
    mockGetRepositories.mockResolvedValue(repositories({}));
    render(<ObservationListScreen siteId={SITE.id} />);

    await waitFor(() => expect(screen.getByTestId('site-header')).toBeTruthy());
    expect(screen.getByText('Hospital DemoCare Pacific')).toBeTruthy();
    expect(screen.getByText('Panama City · Panama')).toBeTruthy();
  });

  it('lists one card per observation', async () => {
    mockGetRepositories.mockResolvedValue(
      repositories({ observations: [observation({ id: 'obs-1' }), observation({ id: 'obs-2' })] })
    );
    render(<ObservationListScreen siteId={SITE.id} />);

    await waitFor(() => expect(screen.getByTestId('observation-card-obs-1')).toBeTruthy());
    expect(screen.getByTestId('observation-card-obs-2')).toBeTruthy();
  });

  it('shows an empty state when the site has no observations', async () => {
    mockGetRepositories.mockResolvedValue(repositories({ observations: [] }));
    render(<ObservationListScreen siteId={SITE.id} />);

    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeTruthy());
    expect(screen.getByText('Sin observaciones')).toBeTruthy();
    // The site is still identifiable even with nothing to show under it.
    expect(screen.getByTestId('site-header')).toBeTruthy();
  });

  it('shows a retryable error state when the read fails', async () => {
    mockGetRepositories.mockResolvedValue(repositories({ error: new Error('database is locked') }));
    render(<ObservationListScreen siteId={SITE.id} />);

    await waitFor(() => expect(screen.getByTestId('error-state')).toBeTruthy());
    expect(screen.getByText('database is locked')).toBeTruthy();
  });

  it('reports a site no longer stored locally, distinctly from a read error', async () => {
    mockGetRepositories.mockResolvedValue(repositories({ site: null }));
    render(<ObservationListScreen siteId={SITE.id} />);

    await waitFor(() => expect(screen.getByTestId('error-state')).toBeTruthy());
    expect(screen.getByText('Sitio no encontrado')).toBeTruthy();
  });

  it('filters the list by the search query, across brand/model/modality/notes', async () => {
    mockGetRepositories.mockResolvedValue(
      repositories({
        observations: [
          observation({ id: 'obs-1', brand: 'NovaMed' }),
          observation({ id: 'obs-2', brand: 'Aurelia Health' }),
        ],
      })
    );
    render(<ObservationListScreen siteId={SITE.id} />);
    await waitFor(() => expect(screen.getByTestId('observation-card-obs-1')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('observation-search'), 'aurelia');

    expect(screen.queryByTestId('observation-card-obs-1')).toBeNull();
    expect(screen.getByTestId('observation-card-obs-2')).toBeTruthy();
  });

  it('shows a no-results state when the search matches nothing', async () => {
    mockGetRepositories.mockResolvedValue(repositories({}));
    render(<ObservationListScreen siteId={SITE.id} />);
    await waitFor(() => expect(screen.getByTestId('observation-card-obs-1')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('observation-search'), 'no existe ninguna así');

    expect(screen.getByTestId('observation-no-results')).toBeTruthy();
    expect(screen.queryByTestId('observation-card-obs-1')).toBeNull();
  });

  it('opens the note modal with the observation note, and closes it', async () => {
    mockGetRepositories.mockResolvedValue(
      repositories({ observations: [observation({ notes: 'Field note text.' })] })
    );
    render(<ObservationListScreen siteId={SITE.id} />);
    await waitFor(() => expect(screen.getByTestId('observation-card-obs-1')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Ver nota de la observación'));
    expect(screen.getByTestId('observation-note-text')).toHaveTextContent('Field note text.');

    fireEvent.press(screen.getByTestId('observation-note-close'));
    expect(screen.queryByTestId('observation-note-text')).toBeNull();
  });

  it('shows an explicit empty state for an observation with no note', async () => {
    mockGetRepositories.mockResolvedValue(repositories({ observations: [observation({ notes: null })] }));
    render(<ObservationListScreen siteId={SITE.id} />);
    await waitFor(() => expect(screen.getByTestId('observation-card-obs-1')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Ver nota de la observación'));

    expect(screen.getByTestId('observation-note-empty')).toHaveTextContent(
      'No hay notas registradas para esta observación.'
    );
  });

  it('asks for confirmation before doing anything destructive, and performs no deletion', async () => {
    mockGetRepositories.mockResolvedValue(repositories({}));
    render(<ObservationListScreen siteId={SITE.id} />);
    await waitFor(() => expect(screen.getByTestId('observation-card-obs-1')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Eliminar observación'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Eliminar observación',
      expect.stringContaining('no se puede deshacer'),
      expect.any(Array)
    );
    // The card is still there: confirming isn't wired to this test, and even
    // pressing "Eliminar" would not remove it — no delete path exists yet
    // (CLAUDE.md §9, docs/database.md §16).
    expect(screen.getByTestId('observation-card-obs-1')).toBeTruthy();
  });

  it('tells the user editing is not available yet, rather than doing nothing silently', async () => {
    mockGetRepositories.mockResolvedValue(repositories({}));
    render(<ObservationListScreen siteId={SITE.id} />);
    await waitFor(() => expect(screen.getByTestId('observation-card-obs-1')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Editar observación'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Edición no disponible',
      expect.stringContaining('no existe un flujo para editar')
    );
  });
});
