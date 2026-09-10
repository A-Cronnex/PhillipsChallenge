/**
 * The HTTP transport.
 *
 * The property that matters most: it never throws. A field device is offline
 * by design (docs/offline-sync.md §2), so a failed request is an ordinary
 * outcome — an exception escaping here would abort a run mid-batch and leave
 * records stuck in `syncing`.
 */
import { createHttpSyncTransport } from '../../../services/sync/http-transport';
import type { SyncRequest } from '../../../types/sync-contract';

const CONFIGURED = { mode: 'configured' as const, baseUrl: 'https://sync.example.org' };

const REQUEST: SyncRequest = {
  deviceId: 'device-1',
  clientTime: '2026-09-09T14:48:00.000Z',
  changes: [],
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const VALID_BODY = { serverTime: '2026-09-09T14:48:00.000Z', results: [] };

describe('createHttpSyncTransport', () => {
  it('posts the batch as JSON to the versioned endpoint', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(VALID_BODY));
    const transport = createHttpSyncTransport({
      config: CONFIGURED,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await transport.push(REQUEST);

    expect(result).toEqual({ status: 'ok', response: VALID_BODY });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://sync.example.org/v1/sync');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(REQUEST);
  });

  it('includes injected authentication headers', async () => {
    // The protocol is an open decision (CLAUDE.md §18); the transport only
    // carries whatever headers it is given.
    const fetchImpl = jest.fn(async () => jsonResponse(VALID_BODY));
    const transport = createHttpSyncTransport({
      config: CONFIGURED,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      authHeaders: async () => ({ authorization: 'Bearer x' }),
    });

    await transport.push(REQUEST);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer x');
  });

  it('reports a failure instead of throwing when the network is down', async () => {
    const transport = createHttpSyncTransport({
      config: CONFIGURED,
      fetchImpl: (async () => {
        throw new TypeError('Network request failed');
      }) as unknown as typeof fetch,
    });

    await expect(transport.push(REQUEST)).resolves.toMatchObject({
      status: 'failed',
      retryable: true,
    });
  });

  it('reports a timeout as retryable', async () => {
    const transport = createHttpSyncTransport({
      config: CONFIGURED,
      fetchImpl: (async () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        throw error;
      }) as unknown as typeof fetch,
    });

    const result = await transport.push(REQUEST);

    expect(result).toMatchObject({ status: 'failed', retryable: true });
    if (result.status === 'failed') expect(result.reason).toMatch(/tiempo de espera/i);
  });

  it.each([500, 502, 429])('treats %d as retryable', async (status) => {
    const transport = createHttpSyncTransport({
      config: CONFIGURED,
      fetchImpl: (async () => jsonResponse({}, status)) as unknown as typeof fetch,
    });

    await expect(transport.push(REQUEST)).resolves.toMatchObject({
      status: 'failed',
      retryable: true,
    });
  });

  it.each([400, 401, 413])('treats %d as not retryable', async (status) => {
    // Resending an unchanged batch the server already refused will be refused
    // again.
    const transport = createHttpSyncTransport({
      config: CONFIGURED,
      fetchImpl: (async () => jsonResponse({}, status)) as unknown as typeof fetch,
    });

    await expect(transport.push(REQUEST)).resolves.toMatchObject({
      status: 'failed',
      retryable: false,
    });
  });

  it('refuses a 200 whose body is not a sync response', async () => {
    // A captive portal answering 200 with an HTML login page. Treating it as
    // success would mark records synchronized that were never stored.
    const transport = createHttpSyncTransport({
      config: CONFIGURED,
      fetchImpl: (async () =>
        jsonResponse({ message: 'please log in' })) as unknown as typeof fetch,
    });

    await expect(transport.push(REQUEST)).resolves.toMatchObject({
      status: 'failed',
      retryable: false,
    });
  });

  it('reports a failure when a response body cannot be parsed', async () => {
    const transport = createHttpSyncTransport({
      config: CONFIGURED,
      fetchImpl: (async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('Unexpected token <');
          },
        }) as unknown as Response) as unknown as typeof fetch,
    });

    await expect(transport.push(REQUEST)).resolves.toMatchObject({ status: 'failed' });
  });

  it('fails without calling fetch when sync is disabled', async () => {
    const fetchImpl = jest.fn();
    const transport = createHttpSyncTransport({
      config: { mode: 'disabled' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await transport.push(REQUEST);

    expect(result).toMatchObject({ status: 'failed', retryable: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails without calling fetch when the URL is plaintext', async () => {
    const fetchImpl = jest.fn();
    const transport = createHttpSyncTransport({
      config: { mode: 'configured', baseUrl: 'http://sync.example.org' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await transport.push(REQUEST);

    expect(result).toMatchObject({ status: 'failed', retryable: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
