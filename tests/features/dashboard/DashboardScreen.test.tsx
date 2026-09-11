import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { DashboardScreen } from '../../../features/dashboard/ui/DashboardScreen';
import type { ObservationFact } from '../../../features/dashboard/domain/metrics';
import type { SyncStateCounts } from '../../../features/dashboard/application/ports';
import { setDashboardScopeSite } from '../../../lib/dashboard-scope';
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

/** Pre-order `testID`s from a react-test-renderer JSON tree, for order assertions. */
function collectTestIds(node: unknown, ids: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) collectTestIds(child, ids);
    return ids;
  }
  if (node && typeof node === 'object') {
    const element = node as { props?: { testID?: string }; children?: unknown };
    if (element.props?.testID) ids.push(element.props.testID);
    if (element.children) collectTestIds(element.children, ids);
  }
  return ids;
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
  setDashboardScopeSite(null);
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
    expect(screen.getAllByText(/sin conexión/i).length).toBeGreaterThan(0);
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

  it('reduces sync to a single corner icon, with neither of the old buttons', async () => {
    mockGetRepositories.mockResolvedValue(buildRepositories({ facts: [fact()] }));
    render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByTestId('dashboard-screen')).toBeTruthy());
    expect(screen.getByTestId('sync-icon-button')).toBeTruthy();
    expect(screen.queryByText('Sincronizar ahora')).toBeNull();
    expect(screen.queryByText('Mostrar identificadores para configurar acceso')).toBeNull();
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

  it('places the sync title next to the icon button, not inside the credential panel', async () => {
    mockGetRepositories.mockResolvedValue(buildRepositories({ facts: [fact()] }));
    render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByTestId('dashboard-screen')).toBeTruthy());
    // Exactly one "Sincronización" title on screen, not one per sync widget.
    expect(screen.getAllByText('Sincronización')).toHaveLength(1);
  });

  it('shows the stat tiles before the sync panel and other sections', async () => {
    mockGetRepositories.mockResolvedValue(buildRepositories({ facts: [fact()] }));
    render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByTestId('dashboard-screen')).toBeTruthy());
    // Walk the rendered tree in document order collecting testIDs, rather
    // than JSON.stringify-ing it (React's internal fiber refs make that
    // circular), to check the tiles appear before the rest of the screen.
    const ids = collectTestIds(screen.toJSON());
    expect(ids.indexOf('tile-sites')).toBeLessThan(ids.indexOf('dashboard-scope'));
    expect(ids.indexOf('tile-sites')).toBeLessThan(ids.indexOf('section-modality'));
  });

  it('shows no customer-summary section when the map has not selected a site', async () => {
    mockGetRepositories.mockResolvedValue(buildRepositories({ facts: [fact()] }));
    render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByTestId('dashboard-screen')).toBeTruthy());
    expect(screen.queryByTestId('section-customer-summary')).toBeNull();
    expect(screen.queryByTestId('section-confidence-frequency')).toBeNull();
  });

  it('shows a confidence gauge and a reliability-by-frequency chart once the map scopes a site', async () => {
    setDashboardScopeSite({
      siteId: 'site-1',
      name: 'Hospital Alfa',
      city: 'Ciudad de Panamá',
      country: 'Panamá',
    });
    mockGetRepositories.mockResolvedValue(
      buildRepositories({
        facts: [
          fact({ observationId: 'a', siteId: 'site-1', overallConfidence: 'high' }),
          fact({ observationId: 'b', siteId: 'site-1', overallConfidence: 'low' }),
          fact({ observationId: 'c', siteId: 'site-2', overallConfidence: 'high' }),
        ],
      })
    );
    render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByTestId('dashboard-screen')).toBeTruthy());
    expect(screen.getByText('Resumen del cliente: Hospital Alfa')).toBeTruthy();
    expect(screen.getByTestId('customer-summary-gauge')).toBeTruthy();
    // 1 high + 1 low at site-1 only — site-2's observation must not leak in.
    // confidenceScore: (1*1 + 1*0.33) / 2 * 100 = 66.5, rounded to 67.
    expect(screen.getByTestId('customer-summary-gauge-value')).toHaveTextContent('67%');

    expect(screen.getByTestId('section-confidence-frequency')).toBeTruthy();
    expect(screen.getByTestId('confidence-frequency-chart-bar-high')).toBeTruthy();
    expect(screen.getByTestId('confidence-frequency-chart-bar-low')).toBeTruthy();
  });

  it('clears the customer summary and hides the scoped sections', async () => {
    setDashboardScopeSite({
      siteId: 'site-1',
      name: 'Hospital Alfa',
      city: null,
      country: null,
    });
    mockGetRepositories.mockResolvedValue(
      buildRepositories({ facts: [fact({ siteId: 'site-1' })] })
    );
    render(<DashboardScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('section-customer-summary')).toBeTruthy()
    );
    fireEvent.press(screen.getByTestId('clear-customer-summary'));

    await waitFor(() =>
      expect(screen.queryByTestId('section-customer-summary')).toBeNull()
    );
    expect(screen.queryByTestId('section-confidence-frequency')).toBeNull();
  });

  it('tells the user when the scoped site has no local observations, without crashing', async () => {
    setDashboardScopeSite({
      siteId: 'site-missing',
      name: 'Hospital Fantasma',
      city: null,
      country: null,
    });
    mockGetRepositories.mockResolvedValue(buildRepositories({ facts: [fact()] }));
    render(<DashboardScreen />);

    await waitFor(() => expect(screen.getByTestId('dashboard-screen')).toBeTruthy());
    expect(screen.getByTestId('customer-summary-empty')).toBeTruthy();
  });
});
