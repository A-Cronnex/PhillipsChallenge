/**
 * `POST /v1/sync`, expressed as a function from a parsed request to a
 * response.
 *
 * No framework type appears here. Express, Fastify and Node's own
 * `http` module all reduce to method + path + headers + body string, so
 * keeping the handler at that level means the endpoint's behaviour — status
 * codes, error shapes, authentication ordering — is testable in the ordinary
 * Jest run, without binding a socket or committing to a web framework that
 * docs/tech-stack.md §5 never named.
 */
import type { SyncErrorResponse, SyncRequest } from '../../../types/sync-contract';
import { SYNC_ENDPOINT_PATH } from '../../../types/sync-contract';
import { synchronizeBatch } from '../application/sync-service';
import type { SyncServiceDeps } from '../application/ports';
import { isUuid } from '../validation/validate-change';
import type { Authenticator } from './authentication';

export interface HttpRequest {
  method: string;
  path: string;
  /** Header names must already be lower-cased by the transport binding. */
  headers: Readonly<Record<string, string>>;
  body: string;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface SyncEndpointDeps extends SyncServiceDeps {
  authenticator: Authenticator;
  /**
   * Where unexpected failures go. Injected rather than calling `console`
   * directly so a deployment can route it, and so tests can assert that a
   * payload never reaches it — error output must not leak hospital data
   * (CLAUDE.md §15).
   */
  logError?: (message: string) => void;
}

const JSON_HEADERS = { 'content-type': 'application/json' };

function json(status: number, body: unknown): HttpResponse {
  return { status, headers: { ...JSON_HEADERS }, body: JSON.stringify(body) };
}

function error(
  status: number,
  code: SyncErrorResponse['error']['code'],
  message: string
): HttpResponse {
  return json(status, { error: { code, message } });
}

export function createSyncEndpoint(deps: SyncEndpointDeps) {
  return async function handleSync(request: HttpRequest): Promise<HttpResponse> {
    if (request.path !== SYNC_ENDPOINT_PATH) {
      return error(404, 'malformed_request', 'Unknown path.');
    }

    if (request.method.toUpperCase() !== 'POST') {
      return {
        ...error(405, 'malformed_request', 'Use POST.'),
        headers: { ...JSON_HEADERS, allow: 'POST' },
      };
    }

    // Authentication runs before the body is parsed. Parsing first would let an
    // unauthenticated caller spend the server's CPU on arbitrary JSON.
    const auth = await deps.authenticator.authenticate(request.headers);
    if (!auth.authenticated) {
      return error(401, 'unauthenticated', auth.reason);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(request.body);
    } catch {
      return error(400, 'malformed_request', 'Body is not valid JSON.');
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return error(400, 'malformed_request', 'Body must be a JSON object.');
    }

    const body = parsed as Partial<SyncRequest>;

    if (!isUuid(body.deviceId)) {
      return error(400, 'malformed_request', '"deviceId" must be a UUID.');
    }

    // The device that authenticated must be the device the batch claims to
    // come from. Otherwise one device could replay another's batch under its
    // own credentials, and replay detection — which is keyed on the device id
    // (docs/offline-sync.md §7) — would be attributing changes to the wrong
    // installation.
    if (body.deviceId !== auth.principal.deviceId) {
      return error(
        401,
        'unauthenticated',
        '"deviceId" does not match the authenticated device.'
      );
    }

    try {
      const result = await synchronizeBatch(
        { deviceId: body.deviceId, clientTime: String(body.clientTime ?? ''), changes: body.changes ?? [] },
        auth.principal,
        { store: deps.store, now: deps.now }
      );

      if (result.status === 'error') {
        const status = result.error.code === 'batch_too_large' ? 413 : 400;
        return json(status, { error: result.error });
      }

      return json(200, result.response);
    } catch (thrown) {
      // Deliberately generic to the caller and to the log: the message could
      // otherwise carry row contents (CLAUDE.md §15). The batch was not
      // applied as a whole, so the client keeps everything pending.
      deps.logError?.(
        `sync: unhandled failure (${thrown instanceof Error ? thrown.name : 'unknown'})`
      );
      return error(500, 'internal_error', 'The batch could not be processed.');
    }
  };
}
