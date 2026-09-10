import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { DashboardScreen } from '../../../features/dashboard/ui/DashboardScreen';
import type { ObservationFact } from '../../../features/dashboard/domain/metrics';
import type { SyncStateCounts } from '../../../features/dashboard/application/ports';
import { SYNC_STATUSES, type SyncStatus } from '../../../types/domain';

const mockGetRepositories = jest.fn();
jest.mock('../../../lib/container', () => ({
  getRepositories: () => mockGetRepositories(),
}));

function fact(overrides: Partial<ObservationFact> = {}): ObservationFact {
  return {
    observationId: 'obs-1',
    siteId: 'site-1',
    siteName: 'Hospital Alfa',
    country: 'Panamá',
    city: 'Ciudad de Panamá',
    visitDate: '2026-09-01',
    quantity: 3,
    brand: 'Philips',
    model: 'IntelliVue MX450',
    modality: 'Monitor',
    estimatedYearsOfUse: 3,
    estimatedInstallationYear: null,
    overallConfidence: 'high',
    ...overrides,
  };
}

function counts(partial: Partial<Record<SyncStatus, number>>): SyncStateCounts {
  const byStatus = Object.fromEntries(
    SYNC_STATUSES.map((status) => [status, partial[status] ?? 0])
  ) as Record<SyncStatus, number>;
  return {
    byStatus,
    total: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
  };
}

function buildRepositories(options: {
  facts?: ObservationFact[] | Error;
  sync?: SyncStateCounts | Error;
}) {
  return {
    dashboard: {
      loadObservationFacts: async () => {
        if (options.facts instanceof Error) throw options.facts;
        return options.facts ?? [];
      },
    },
    syncState: {
      countByStatus: async () => {
        if (options.sync instanceof Error) throw options.sync;
        return options.sync ?? counts({});
      },
    },
    // The dashboard must never read map data or write observations. These
    // throw so an accidental dependency fails the test instead of passing
    // silently.
    mapData: {
      loadMapDataset: () => {
        throw new Error('dashboard must not read map data');
      },
    },
    observations: {
      save: () => {
        throw new Error('dashboard must not write observations');
      },
    },
  };
}

beforeEach(() => {
  mockGetRepositories.mockReset();
});

describe('DashboardScreen', () => {
  it('shows a loading state while the local rows are read', async () => {
    mockGetRepositories.mockReturnValue(new Promise(() => {}));
    render(<DashboardScreen />);

    expect(screen.getByTestId('loading-state')).toBeTruthy();
  });

  it('shows an empty state that explains the dashboard is computed on-device', async () => {
    mockGetRepositories.mockResolvedValue(buildRepositories({ facts: [] }));
    render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeTruthy());
    expect(screen.getByText(/sin conexión/i)).toBeTruthy();
  });

  it('renders the totals computed from local observations', async () => {
    mockGetRepositories.mockResolvedValue(
      buildRepositories({
        facts: [
          fact({ observationId: 'a', quantity: 3 }),
          fact({ observationId: 'b', siteId: 'site-2', siteName: 'Hospital Beta', quantity: 2 }),
        ],
      })
    );
    render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByTestId('dashboard-screen')).toBeTruthy());
    expect(screen.getByTestId('tile-sites-value')).toHaveTextContent('2');
    expect(screen.getByTestId('tile-observations-value')).toHaveTextContent('2');
    expect(screen.getByTestId('tile-units-value')).toHaveTextContent('5');
  });

  it('shows equipment that was never assigned a modality instead of hiding it', async () => {
    mockGetRepositories.mockResolvedValue(
      buildRepositories({ facts: [fact({ modality: null })] })
    );
    render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByTestId('dashboard-screen')).toBeTruthy());
    expect(screen.getByTestId('modality-unrecorded')).toBeTruthy();
  });

  it('presents synchronization state as its own section, separate from the metrics', async () => {
    mockGetRepositories.mockResolvedValue(
      buildRepositories({ facts: [fact()], sync: counts({ pending: 4 }) })
    );
    render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByTestId('dashboard-screen')).toBeTruthy());
    expect(screen.getByTestId('section-sync')).toBeTruthy();
    expect(screen.getByTestId('sync-pending-value')).toHaveTextContent('4');
    // The metrics tile counts the observation regardless of its sync state.
    expect(screen.getByTestId('tile-observations-value')).toHaveTextContent('1');
  });

  it('still renders the metrics when synchronization state cannot be read', async () => {
    mockGetRepositories.mockResolvedValue(
      buildRepositories({ facts: [fact()], sync: new Error('no table') })
    );
    render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByTestId('dashboard-screen')).toBeTruthy());
    expect(screen.getByTestId('sync-unavailable')).toBeTruthy();
    expect(screen.getByTestId('tile-observations-value')).toHaveTextContent('1');
  });

  it('offers a retry when the local rows cannot be read', async () => {
    mockGetRepositories.mockResolvedValueOnce(
      buildRepositories({ facts: new Error('database is locked') })
    );
    mockGetRepositories.mockResolvedValueOnce(buildRepositories({ facts: [fact()] }));

    render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByTestId('error-state')).toBeTruthy());
    expect(screen.getByText(/database is locked/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('retry-button'));

    await waitFor(() => expect(screen.getByTestId('dashboard-screen')).toBeTruthy());
  });

  it('lists a site with aging equipment as a refresh opportunity', async () => {
    mockGetRepositories.mockResolvedValue(
      buildRepositories({
        facts: [fact({ estimatedYearsOfUse: 14, siteId: 'site-old' })],
      })
    );
    render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByTestId('dashboard-screen')).toBeTruthy());
    expect(screen.getByTestId('aging-site-old')).toBeTruthy();
  });
});
