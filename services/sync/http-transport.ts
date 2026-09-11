/**
 * HTTP transport for `POST /v1/sync`.
 *
 * The one rule this file exists to keep: it never throws. A field device is
 * offline most of the time by design, so a failed request is an ordinary
 * outcome and is returned as a value (docs/offline-sync.md §2). An exception
 * escaping here would abort a run mid-batch and leave records stuck in
 * `syncing`.
 */
import {
  SYNC_ENDPOINT_PATH,
  SYNC_PULL_PATH,
  type SyncPullRequest,
  type SyncPullResponse,
  type SyncRequest,
  type SyncResponse,
} from '../../types/sync-contract';
import type {
  PullTransportResult,
  SyncTransport,
  TransportResult,
} from '../../features/synchronization/application/ports';
import { resolveSyncEndpointUrl, type SyncServerConfig } from './config';

/**
 * Per-request timeout.
 *
 * `fetch` on a device with a captive portal or a dead uplink can hang far
 * longer than a user will wait, and a hung request holds its records in
 * `syncing` for the whole time.
 */
export const REQUEST_TIMEOUT_MS = 30_000;

export interface HttpTransportDeps {
  config?: SyncServerConfig;
  /**
   * Extra headers, normally the authentication credential.
   *
   * Injected because the authentication protocol is an open decision
   * (CLAUDE.md §18) — this module must not decide what a credential looks
   * like. Whatever the protocol turns out to be, it supplies headers here.
   */
  authHeaders?: () => Promise<Record<string, string>>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function isSyncResponse(value: unknown): value is SyncResponse {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<SyncResponse>;
  return (
    typeof candidate.serverTime === 'string' && Array.isArray(candidate.results)
  );
}

function isPullResponse(value: unknown): value is SyncPullResponse {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<SyncPullResponse>;
  return (
    typeof candidate.serverTime === 'string' &&
    Array.isArray(candidate.changes) &&
    typeof candidate.cursor === 'string' &&
    typeof candidate.hasMore === 'boolean'
  );
}

/**
 * Shared plumbing for both directions.
 *
 * Extracted so the pull cannot drift from the push on the things that took
 * work to get right: the misconfigured-URL case is not retryable, a non-2xx
 * below 500 is not retryable, and a 200 whose body is the wrong shape is a
 * captive portal rather than a success.
 */
type Validator<T> = (value: unknown) => value is T;

export function createHttpSyncTransport(
  deps: HttpTransportDeps = {}
): SyncTransport {
  const doFetch = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS;

  async function send<T>(
    path: string,
    body: unknown,
    isValid: Validator<T>
  ): Promise<{ status: 'ok'; body: T } | { status: 'failed'; reason: string; retryable: boolean }> {
    let url: string | null;
    try {
      url = resolveSyncEndpointUrl(path, deps.config);
    } catch (error) {
      // A misconfigured URL is not retryable — retrying sends nowhere.
      return {
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
        retryable: false,
      };
    }

    if (url === null) {
      return {
        status: 'failed',
        reason: 'No hay un servidor de sincronización configurado.',
        retryable: false,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        ...(deps.authHeaders ? await deps.authHeaders() : {}),
      };

      const response = await doFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        // 4xx is the server refusing this request's shape or credentials, and
        // resending it unchanged will be refused again. 5xx and 429 are
        // transient.
        const retryable = response.status >= 500 || response.status === 429;
        return {
          status: 'failed',
          reason: `El servidor respondió ${response.status}.`,
          retryable,
        };
      }

      const parsed: unknown = await response.json();

      if (!isValid(parsed)) {
        // A 200 whose body is not the expected shape means something else
        // answered — a proxy, a captive portal login page. Treating it as
        // success would mark records synchronized that were never stored, or
        // apply changes that were never sent.
        return {
          status: 'failed',
          reason: 'La respuesta del servidor no tiene el formato esperado.',
          retryable: false,
        };
      }

      return { status: 'ok', body: parsed };
    } catch (error) {
      const aborted =
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError');
      return {
        status: 'failed',
        reason: aborted
          ? 'Se agotó el tiempo de espera del servidor.'
          : 'No se pudo contactar al servidor.',
        retryable: true,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async push(request: SyncRequest): Promise<TransportResult> {
      const result = await send(SYNC_ENDPOINT_PATH, request, isSyncResponse);
      return result.status === 'ok' ? { status: 'ok', response: result.body } : result;
    },

    async pull(request: SyncPullRequest): Promise<PullTransportResult> {
      const result = await send(SYNC_PULL_PATH, request, isPullResponse);
      return result.status === 'ok' ? { status: 'ok', response: result.body } : result;
    },
  };
}
