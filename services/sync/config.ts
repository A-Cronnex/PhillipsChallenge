/**
 * Sync server configuration.
 *
 * Mirrors the shape of services/maps/tile-source.ts, and for the same reason:
 * the default is the mode that needs no infrastructure, so the app is honest
 * about having no backend rather than pointing at a placeholder that fails at
 * runtime.
 *
 * No URL is committed here. Once a deployment exists its address belongs in an
 * environment file read through `app.config.ts` (README §3), never in the
 * repository — and certainly no credentials, which have no representation in
 * this file at all (CLAUDE.md §15).
 */
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
export const syncServerConfig: SyncServerConfig = { mode: 'disabled' };

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
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
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
  if (parsed.protocol !== 'https:' && !isLoopback(parsed.hostname)) {
    throw new InsecureSyncUrlError(config.baseUrl);
  }

  return new URL(path, parsed).toString();
}

export function isSyncConfigured(
  config: SyncServerConfig = syncServerConfig
): boolean {
  return config.mode === 'configured';
}
