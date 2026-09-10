/**
 * Sync server configuration.
 *
 * The rules here are security rules: hospital data must not travel unencrypted
 * (CLAUDE.md §15), and a misconfiguration must fail loudly rather than fall
 * back to sending data somewhere nobody chose.
 */
import {
  InsecureSyncUrlError,
  isSyncConfigured,
  resolveSyncEndpointUrl,
  syncServerConfig,
  type SyncServerConfig,
} from '../../../services/sync/config';
import { SYNC_ENDPOINT_PATH } from '../../../types/sync-contract';

describe('syncServerConfig', () => {
  it('ships disabled, since no deployment is confirmed', () => {
    // docs/tech-stack.md §5 — the backend exists as a decision, not as a
    // running deployment. A committed placeholder URL would fail at runtime.
    expect(syncServerConfig.mode).toBe('disabled');
    expect(isSyncConfigured()).toBe(false);
  });

  it('commits no URL and no credential', () => {
    expect(syncServerConfig.baseUrl).toBeUndefined();
    expect(JSON.stringify(syncServerConfig)).not.toMatch(/token|key|secret|password/i);
  });
});

describe('resolveSyncEndpointUrl', () => {
  const configured = (baseUrl: string): SyncServerConfig => ({
    mode: 'configured',
    baseUrl,
  });

  it('returns null when sync is disabled', () => {
    expect(resolveSyncEndpointUrl(SYNC_ENDPOINT_PATH, { mode: 'disabled' })).toBeNull();
  });

  it('builds the versioned endpoint URL', () => {
    expect(
      resolveSyncEndpointUrl(SYNC_ENDPOINT_PATH, configured('https://sync.example.org'))
    ).toBe('https://sync.example.org/v1/sync');
  });

  it('rejects plaintext http for a remote host', () => {
    expect(() =>
      resolveSyncEndpointUrl(SYNC_ENDPOINT_PATH, configured('http://sync.example.org'))
    ).toThrow(InsecureSyncUrlError);
  });

  it.each(['http://localhost:8080', 'http://127.0.0.1:8080'])(
    'allows plaintext on loopback (%s) for local development',
    (baseUrl) => {
      expect(() =>
        resolveSyncEndpointUrl(SYNC_ENDPOINT_PATH, configured(baseUrl))
      ).not.toThrow();
    }
  );

  it('throws when configured without a baseUrl instead of guessing one', () => {
    expect(() => resolveSyncEndpointUrl(SYNC_ENDPOINT_PATH, { mode: 'configured' })).toThrow();
  });
});
