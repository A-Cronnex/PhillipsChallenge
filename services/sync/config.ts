/** Optional public server URL. Credentials are entered at runtime and never embedded here. */
export type SyncServerMode = 'disabled' | 'configured';

export interface SyncServerConfig {
  mode: SyncServerMode;
  /** Base origin of the sync server, e.g. `https://sync.example.org`. */
  baseUrl?: string;
}

/**
 * `disabled` until a deployment is confirmed.
 *
 * With this default, `runSynchronization` returns `not_configured` and leaves
 * every queued record `pending`, which is the accurate state for a device that
 * has nowhere to sync to.
 */
const syncUrl = process.env.EXPO_PUBLIC_SYNC_URL?.trim();
export const syncServerConfig: SyncServerConfig = syncUrl ? { mode: 'configured', baseUrl: syncUrl } : { mode: 'disabled' };

export class InsecureSyncUrlError extends Error {
  constructor(url: string) {
    super(
      `El servidor de sincronización debe usar https://. Recibido: ${url}. ` +
        'Los datos hospitalarios no pueden viajar sin cifrar.'
    );
    this.name = 'InsecureSyncUrlError';
  }
}

/**
 * Whether `http://` is acceptable for a host.
 *
 * Only loopback. A field device uploading hospital data over plaintext on any
 * other host is not acceptable even temporarily, and "just for the demo" is
 * exactly how such a URL survives into a build (CLAUDE.md §15).
 */
function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
  );
}

/**
 * Builds the absolute endpoint URL, or returns null when sync is disabled.
 *
 * Throws on a misconfigured URL rather than falling back to something that
 * appears to work: a silent fallback here would send data somewhere nobody
 * chose.
 */
export function resolveSyncEndpointUrl(
  path: string,
  config: SyncServerConfig = syncServerConfig
): string | null {
  if (config.mode === 'disabled') return null;

  if (!config.baseUrl) {
    throw new Error(
      'syncServerConfig.mode is "configured" but no baseUrl was provided.'
    );
  }

  const parsed = new URL(config.baseUrl);
  if (parsed.username || parsed.password || (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback(parsed.hostname)))) {
    throw new InsecureSyncUrlError(config.baseUrl);
  }

  return new URL(path, parsed).toString();
}

export function isSyncConfigured(
  config: SyncServerConfig = syncServerConfig
): boolean {
  return config.mode === 'configured';
}
