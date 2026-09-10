/**
 * HTTP behaviour of `POST /v1/sync`.
 *
 * The endpoint is written as a pure function of a parsed request, so its
 * status codes, error shapes and — most importantly — the order in which it
 * authenticates and parses can be tested without binding a socket.
 */
import { createSyncEndpoint } from '../../server/src/http/sync-endpoint';
import { createRejectingAuthenticator } from '../../server/src/http/authentication';
import type { Authenticator } from '../../server/src/http/authentication';
import type { SyncStore } from '../../server/src/application/ports';
import { SYNC_ENDPOINT_PATH } from '../../types/sync-contract';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const DEVICE_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_DEVICE_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-09-09T14:48:00.000Z');

function allowAll(): Authenticator {
  return {
    async authenticate() {
      return { authenticated: true, principal: { userId: USER_ID, deviceId: DEVICE_ID } };
    },
  };
}

function createStore(): SyncStore {
  return {
    async applyChange(_change, _context, decide) {
      return { status: 'ok', decision: decide(null) };
    },
  };
}

function endpoint(overrides: Partial<Parameters<typeof createSyncEndpoint>[0]> = {}) {
  return createSyncEndpoint({
    store: createStore(),
    authenticator: allowAll(),
    now: () => NOW,
    ...overrides,
  });
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    path: SYNC_ENDPOINT_PATH,
    headers: {},
    body: JSON.stringify({ deviceId: DEVICE_ID, clientTime: NOW.toISOString(), changes: [] }),
    ...overrides,
  } as Parameters<ReturnType<typeof endpoint>>[0];
}

describe('POST /v1/sync', () => {
  it('accepts a valid empty batch', async () => {
    const response = await endpoint()(request());

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      serverTime: NOW.toISOString(),
      results: [],
    });
  });

  it('answers 404 for another path', async () => {
    const response = await endpoint()(request({ path: '/v1/observations' }));
    expect(response.status).toBe(404);
  });

  it('answers 405 with an Allow header for the wrong method', async () => {
    const response = await endpoint()(request({ method: 'GET' }));

    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe('POST');
  });

  it('refuses every request when no authenticator is configured', async () => {
    // The shipped default. An endpoint that accepts hospital data from anyone
    // who can reach the port is not a safe default while the protocol is an
    // open decision (CLAUDE.md §18).
    const response = await endpoint({
      authenticator: createRejectingAuthenticator(),
    })(request());

    expect(response.status).toBe(401);
    expect(JSON.parse(response.body).error.code).toBe('unauthenticated');
  });

  it('authenticates before parsing the body', async () => {
    // Otherwise an unauthenticated caller can spend the server's CPU on
    // arbitrary JSON.
    const authenticate = jest.fn(async () => ({
      authenticated: false as const,
      reason: 'no',
    }));

    const response = await endpoint({ authenticator: { authenticate } })(
      request({ body: '{not json' })
    );

    expect(authenticate).toHaveBeenCalled();
    expect(response.status).toBe(401);
  });

  it('answers 400 for a body that is not JSON', async () => {
    const response = await endpoint()(request({ body: 'not json at all' }));

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe('malformed_request');
  });

  it('answers 400 for a JSON array body', async () => {
    const response = await endpoint()(request({ body: '[]' }));
    expect(response.status).toBe(400);
  });

  it('answers 400 when deviceId is not a UUID', async () => {
    const response = await endpoint()(
      request({ body: JSON.stringify({ deviceId: 'phone-1', changes: [] }) })
    );

    expect(response.status).toBe(400);
  });

  it('answers 401 when the batch claims a different device than the caller', async () => {
    // Replay detection is keyed on the device id (docs/offline-sync.md §7);
    // letting a caller claim another device's id would attribute changes to the
    // wrong installation.
    const response = await endpoint()(
      request({
        body: JSON.stringify({
          deviceId: OTHER_DEVICE_ID,
          clientTime: NOW.toISOString(),
          changes: [],
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  it('answers 413 for a batch over the cap', async () => {
    const changes = Array.from({ length: 51 }, (_, index) => ({
      entityType: 'site',
      entityId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      operation: 'create',
      localVersion: 1,
      baseServerVersion: null,
      updatedAt: NOW.toISOString(),
      payload: {},
    }));

    const response = await endpoint()(
      request({
        body: JSON.stringify({ deviceId: DEVICE_ID, clientTime: NOW.toISOString(), changes }),
      })
    );

    expect(response.status).toBe(413);
  });

  it('answers 500 without leaking the failure, and logs no payload', async () => {
    const logError = jest.fn();
    const exploding: SyncStore = {
      async applyChange() {
        throw new Error('connection to hospital_db failed for Hospital Santo Tomás');
      },
    };

    const response = await endpoint({ store: exploding, logError })(
      request({
        body: JSON.stringify({
          deviceId: DEVICE_ID,
          clientTime: NOW.toISOString(),
          changes: [
            {
              entityType: 'site',
              entityId: '00000000-0000-4000-8000-000000000001',
              operation: 'create',
              localVersion: 1,
              baseServerVersion: null,
              updatedAt: NOW.toISOString(),
              payload: {
                name: 'Hospital Santo Tomás',
                country: null,
                city: null,
                latitude: null,
                longitude: null,
                address: null,
                createdAt: NOW.toISOString(),
                updatedAt: NOW.toISOString(),
              },
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(500);
    expect(response.body).not.toContain('Santo Tomás');
    expect(logError).toHaveBeenCalled();
    expect(logError.mock.calls.flat().join(' ')).not.toContain('Santo Tomás');
  });

  it('always answers JSON', async () => {
    const responses = await Promise.all([
      endpoint()(request()),
      endpoint()(request({ method: 'GET' })),
      endpoint()(request({ body: 'x' })),
    ]);

    for (const response of responses) {
      expect(response.headers['content-type']).toBe('application/json');
      expect(() => JSON.parse(response.body)).not.toThrow();
    }
  });
});
