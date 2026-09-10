import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ObservationCaptureForm } from '../../../features/observations/ui/ObservationCaptureForm';
import type { Repositories } from '../../../lib/container';
import type { NewObservation } from '../../../features/observations/domain/observation';
import type { SyncStatus } from '../../../types/domain';

/**
 * Screen-level tests for manual capture.
 *
 * The composition root is mocked so nothing here touches `expo-sqlite`, which
 * has no Node implementation. What the repositories do with the record is
 * covered by the application and repository tests; these assert the states the
 * screen must present (CLAUDE.md §13): loading, empty, error, validation
 * feedback and confirmation of saved data.
 */

const mockGetRepositories = jest.fn();

jest.mock('../../../lib/container', () => ({
  getRepositories: () => mockGetRepositories(),
}));

jest.mock('../../../lib/id', () => ({ newId: () => 'generated-id' }));

const SITE = {
  id: 'site-1',
  name: 'Hospital Example',
  city: 'Panama City',
  country: 'Panama',
};

const USER = { id: 'user-1', name: 'Field User', role: 'field_user' as const };

interface Saved {
  observation: NewObservation;
  syncStatus: SyncStatus;
}

function buildRepositories(options: {
  sites?: (typeof SITE)[];
  user?: typeof USER | null;
  saveError?: Error;
  saved?: Saved[];
}): Repositories {
  return {
    catalog: { listEquipment: async () => [], createLocalUser: async () => USER, createSite: async () => SITE.id },
    conversations: { save: async () => {}, latest: async () => null, finalize: async () => {} },
    sites: { listSites: async () => options.sites ?? [SITE] },
    users: {
      // `'user' in options`, not `??`: an explicit null means "no local user",
      // which `options.user ?? USER` would silently turn back into a user.
      getCurrentUser: async () =>
        'user' in options ? (options.user ?? null) : USER,
    },
    // Capture must never read map data. These throw rather than returning
    // empty results, so an accidental dependency fails the test instead of
    // passing silently.
    mapData: {
      loadMapDataset: () => {
        throw new Error('capture must not read map data');
      },
    },
    dashboard: {
      loadObservationFacts: () => {
        throw new Error('capture must not read dashboard data');
      },
    },
    syncState: {
      countByStatus: () => {
        throw new Error('capture must not read synchronization state');
      },
    },
    mapRegions: {
      listRegions: () => {
        throw new Error('capture must not read map cache state');
      },
      upsertRegion: () => {
        throw new Error('capture must not write map cache state');
      },
      updateRegionStatus: () => {
        throw new Error('capture must not write map cache state');
      },
    },
    // Capture must persist locally and never synchronize (CLAUDE.md §6): the
    // save flow must not block on, or even reach, the network. These throw so
    // an accidental call fails loudly instead of quietly making capture
    // network-dependent.
    syncQueue: {
      releaseStaleSyncing: () => {
        throw new Error('capture must not run synchronization');
      },
      claimPendingChanges: () => {
        throw new Error('capture must not run synchronization');
      },
      markSynchronized: () => {
        throw new Error('capture must not run synchronization');
      },
      markFailed: () => {
        throw new Error('capture must not run synchronization');
      },
      releaseToPending: () => {
        throw new Error('capture must not run synchronization');
      },
    },
    deviceIdentity: {
      getOrCreateDeviceId: () => {
        throw new Error('capture must not need a device identity');
      },
    },
    // No transport at all, matching the shipped configuration: capture has to
    // work with no sync server in existence.
    syncTransport: null,
    observations: {
      async save(observation, syncStatus) {
        if (options.saveError) throw options.saveError;
        options.saved?.push({ observation, syncStatus });
        return {
          id: observation.id,
          syncStatus,
          createdAt: observation.createdAt,
        };
      },
    },
  };
}

beforeEach(() => {
  mockGetRepositories.mockReset();
});

describe('ObservationCaptureForm', () => {
  it('shows a loading state while the local database opens', async () => {
    mockGetRepositories.mockReturnValue(new Promise(() => {}));
    render(<ObservationCaptureForm />);

    expect(screen.getByTestId('loading-state')).toBeTruthy();
  });

  it('renders the form once sites and the local user are available', async () => {
    mockGetRepositories.mockResolvedValue(buildRepositories({}));
    render(<ObservationCaptureForm />);

    await waitFor(() => expect(screen.getByTestId('capture-form')).toBeTruthy());
    expect(screen.getByTestId('input-brand')).toBeTruthy();
  });

  it('shows an empty state when no sites are stored locally', async () => {
    mockGetRepositories.mockResolvedValue(buildRepositories({ sites: [] }));
    render(<ObservationCaptureForm />);

    await waitFor(() => expect(screen.getByText('Registrar sitio')).toBeTruthy());
    expect(screen.getByText('No hay sitios guardados. Registra el primero para comenzar.')).toBeTruthy();
  });

  it('shows an empty state when the device has no local user', async () => {
    mockGetRepositories.mockResolvedValue(buildRepositories({ user: null }));
    render(<ObservationCaptureForm />);

    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeTruthy());
    expect(screen.getByText('No hay un usuario en este dispositivo')).toBeTruthy();
  });

  it('shows a retryable error state when the database cannot be opened', async () => {
    mockGetRepositories.mockRejectedValueOnce(new Error('database is locked'));
    render(<ObservationCaptureForm />);

    await waitFor(() => expect(screen.getByTestId('error-state')).toBeTruthy());
    expect(screen.getByText('database is locked')).toBeTruthy();

    mockGetRepositories.mockResolvedValue(buildRepositories({}));
    fireEvent.press(screen.getByTestId('retry-button'));

    await waitFor(() => expect(screen.getByTestId('capture-form')).toBeTruthy());
  });

  it('shows validation feedback and saves nothing when the draft is incomplete', async () => {
    const saved: Saved[] = [];
    mockGetRepositories.mockResolvedValue(buildRepositories({ saved }));
    render(<ObservationCaptureForm />);

    await waitFor(() => expect(screen.getByTestId('capture-form')).toBeTruthy());
    fireEvent.press(screen.getByTestId('submit-button'));

    await waitFor(() =>
      expect(
        screen.getByText('Selecciona el sitio donde se hizo la observación.')
      ).toBeTruthy()
    );
    expect(
      screen.getByText('Indica al menos la marca, el modelo o la modalidad del equipo.')
    ).toBeTruthy();
    expect(saved).toHaveLength(0);
  });

  it('confirms a saved observation and shows it as pending synchronization', async () => {
    const saved: Saved[] = [];
    mockGetRepositories.mockResolvedValue(buildRepositories({ saved }));
    render(<ObservationCaptureForm />);

    await waitFor(() => expect(screen.getByTestId('capture-form')).toBeTruthy());
    fireEvent.press(screen.getByTestId('option-site-1'));
    fireEvent.changeText(screen.getByTestId('input-brand'), 'Philips');
    fireEvent.press(screen.getByTestId('submit-button'));

    await waitFor(() =>
      expect(screen.getByTestId('save-confirmation')).toBeTruthy()
    );
    expect(screen.getByTestId('sync-badge-pending')).toBeTruthy();
    expect(saved).toHaveLength(1);
    expect(saved[0].syncStatus).toBe('pending');
    expect(saved[0].observation.brand).toBe('Philips');
  });

  it('keeps the site selected after saving so the next item can be captured', async () => {
    const saved: Saved[] = [];
    mockGetRepositories.mockResolvedValue(buildRepositories({ saved }));
    render(<ObservationCaptureForm />);

    await waitFor(() => expect(screen.getByTestId('capture-form')).toBeTruthy());
    fireEvent.press(screen.getByTestId('option-site-1'));
    fireEvent.changeText(screen.getByTestId('input-brand'), 'Philips');
    fireEvent.press(screen.getByTestId('submit-button'));

    await waitFor(() =>
      expect(screen.getByTestId('save-confirmation')).toBeTruthy()
    );
    // Brand cleared for the next entry, site retained.
    expect(screen.getByTestId('input-brand').props.value).toBe('');
    expect(screen.getByTestId('option-site-1').props.accessibilityState.selected).toBe(
      true
    );
  });

  it('reports a persistence failure without discarding what the user typed', async () => {
    mockGetRepositories.mockResolvedValue(
      buildRepositories({ saveError: new Error('disk full') })
    );
    render(<ObservationCaptureForm />);

    await waitFor(() => expect(screen.getByTestId('capture-form')).toBeTruthy());
    fireEvent.press(screen.getByTestId('option-site-1'));
    fireEvent.changeText(screen.getByTestId('input-brand'), 'Philips');
    fireEvent.press(screen.getByTestId('submit-button'));

    await waitFor(() => expect(screen.getByTestId('save-error')).toBeTruthy());
    expect(screen.getByText('disk full')).toBeTruthy();
    // CLAUDE.md §6: unsynchronized user input must not be silently discarded.
    expect(screen.getByTestId('input-brand').props.value).toBe('Philips');
  });

  it('offers a confidence selector only once an attribute has a value', async () => {
    mockGetRepositories.mockResolvedValue(buildRepositories({}));
    render(<ObservationCaptureForm />);

    await waitFor(() => expect(screen.getByTestId('capture-form')).toBeTruthy());
    expect(screen.queryByTestId('confidence-brand')).toBeNull();

    fireEvent.changeText(screen.getByTestId('input-brand'), 'Philips');
    await waitFor(() =>
      expect(screen.getByTestId('confidence-brand')).toBeTruthy()
    );
  });

  it('records the selected confidence with the saved observation', async () => {
    const saved: Saved[] = [];
    mockGetRepositories.mockResolvedValue(buildRepositories({ saved }));
    render(<ObservationCaptureForm />);

    await waitFor(() => expect(screen.getByTestId('capture-form')).toBeTruthy());
    fireEvent.press(screen.getByTestId('option-site-1'));
    fireEvent.changeText(screen.getByTestId('input-brand'), 'Philips');
    await waitFor(() =>
      expect(screen.getByTestId('confidence-brand')).toBeTruthy()
    );
    fireEvent.press(screen.getByTestId('confidence-brand-medium'));
    fireEvent.press(screen.getByTestId('submit-button'));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].observation.attributeConfidence).toEqual([
      {
        attributeName: 'brand',
        confidenceLevel: 'medium',
        attributeStatus: 'reported',
        source: 'text',
      },
    ]);
    expect(saved[0].observation.overallConfidence).toBe('medium');
  });
});
