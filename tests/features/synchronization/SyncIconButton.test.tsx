import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SyncIconButton } from '../../../features/synchronization/ui/SyncIconButton';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => <Text>{name}</Text> };
});

const mockGetRepositories = jest.fn();
jest.mock('../../../lib/container', () => ({
  getRepositories: () => mockGetRepositories(),
}));

beforeEach(() => {
  mockGetRepositories.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * EXPO_PUBLIC_SYNC_URL is unset in this test environment, so
 * services/sync/config.ts's isSyncConfigured() is false and
 * repositories.syncTransport is null here — runSynchronization's own
 * `transport === null` branch returns 'not_configured' immediately, without
 * touching the queue at all. That is exercised for real (not mocked), and
 * lets a queue fake that throws prove it. Nothing about that branch depends
 * on the credential, so this covers the button without needing a full sync
 * queue/transport fake.
 */
function repositoriesNotConfigured() {
  return {
    deviceIdentity: { getOrCreateDeviceId: async () => 'device-1' },
    syncQueue: {
      releaseStaleSyncing: () => {
        throw new Error('must not touch the queue when sync is not configured');
      },
      claimPendingChanges: () => {
        throw new Error('must not touch the queue when sync is not configured');
      },
    },
    syncTransport: null,
  };
}

describe('SyncIconButton', () => {
  it('renders as a plain icon, not a labeled button', () => {
    mockGetRepositories.mockResolvedValue(repositoriesNotConfigured());
    render(<SyncIconButton />);

    expect(screen.getByTestId('sync-icon-button')).toBeTruthy();
    expect(screen.queryByText('Sincronizar ahora')).toBeNull();
  });

  it('runs a sync and reports the outcome when pressed', async () => {
    mockGetRepositories.mockResolvedValue(repositoriesNotConfigured());
    render(<SyncIconButton />);

    fireEvent.press(screen.getByTestId('sync-icon-button'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Sincronización',
        expect.stringContaining('Sin servidor configurado')
      )
    );
  });

  it('calls onComplete after a run finishes', async () => {
    mockGetRepositories.mockResolvedValue(repositoriesNotConfigured());
    const onComplete = jest.fn();
    render(<SyncIconButton onComplete={onComplete} />);

    fireEvent.press(screen.getByTestId('sync-icon-button'));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it('does not start a second run while one is in flight', async () => {
    let resolveRepositories: (value: ReturnType<typeof repositoriesNotConfigured>) => void = () => {};
    mockGetRepositories.mockReturnValue(
      new Promise((resolve) => {
        resolveRepositories = resolve;
      })
    );
    render(<SyncIconButton />);

    fireEvent.press(screen.getByTestId('sync-icon-button'));
    fireEvent.press(screen.getByTestId('sync-icon-button'));

    resolveRepositories(repositoriesNotConfigured());
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledTimes(1));
    expect(mockGetRepositories).toHaveBeenCalledTimes(1);
  });
});
