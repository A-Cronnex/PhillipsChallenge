import { createTokenAuthenticator } from './http/token-authenticator';
/**
 * Process entrypoint for the sync server.
 *
 * Uses Node's built-in `http` module rather than Express or Fastify.
 * docs/tech-stack.md §5 named "Express or Fastify" as part of a proposal, not
 * as a confirmed choice, and `/v1/sync` needs no routing, middleware or
 * templating — one path, one method. Choosing a framework here would settle a
 * decision this file has no reason to settle; the endpoint itself
 * (src/http/sync-endpoint.ts) is framework-agnostic, so adopting one later is
 * a change to this file alone.
 *
 * Run with:  DATABASE_URL=postgres://... node --experimental-strip-types server/src/main.ts
 * See server/README.md.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { createSyncEndpoint, type HttpRequest } from './http/sync-endpoint';
import { createRejectingAuthenticator, type Authenticator } from './http/authentication';
import { createInsecureDevAuthenticator } from './http/dev-authenticator';
import { createPostgresSyncStore } from './infrastructure/postgres/postgres-sync-store';
import { createPostgresPool } from './infrastructure/postgres/pool';

/** Caps a request body so an oversized upload cannot exhaust memory. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function readBody(request: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // `null` rather than a throw: the caller answers 413 and the socket is
        // destroyed, instead of an unhandled rejection taking the process down.
        request.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function normaliseHeaders(request: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') headers[name.toLowerCase()] = value;
    else if (Array.isArray(value)) headers[name.toLowerCase()] = value.join(',');
  }
  return headers;
}

function resolveAuthenticator(): Authenticator {
  if (process.env.SYNC_DEVICE_CREDENTIALS) return createTokenAuthenticator(process.env.SYNC_DEVICE_CREDENTIALS);
  if (process.env.SYNC_ALLOW_INSECURE_DEV_AUTH === 'true') {
    if (process.env.NODE_ENV === 'production') throw new Error('Development authentication is forbidden in production.');
    // Loud on purpose. This path trusts request headers and verifies nothing.
    console.warn(
      '[sync] SYNC_ALLOW_INSECURE_DEV_AUTH=true — requests are NOT authenticated. ' +
        'Development only.'
    );
    return createInsecureDevAuthenticator();
  }
  return createRejectingAuthenticator();
}

export function main(): void {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // No default connection string, and none is read from a committed file:
    // credentials must not live in the repository (CLAUDE.md §15).
    console.error('[sync] DATABASE_URL is not set.');
    process.exit(1);
    return;
  }

  const port = Number(process.env.PORT ?? 8080);
  const pool = createPostgresPool({ connectionString });
  const handle = createSyncEndpoint({
    store: createPostgresSyncStore({
      pool,
      logError: (message) => console.error(`[sync] ${message}`),
    }),
    authenticator: resolveAuthenticator(),
    now: () => new Date(),
    logError: (message) => console.error(`[sync] ${message}`),
  });

  const server = createServer(
    (request: IncomingMessage, response: ServerResponse) => {
      void (async () => {
        try {
          const body = await readBody(request);
          if (body === null) {
            response.writeHead(413, { 'content-type': 'application/json' });
            response.end(
              JSON.stringify({
                error: { code: 'batch_too_large', message: 'Request body is too large.' },
              })
            );
            return;
          }

          const parsedPath = (request.url ?? '/').split('?')[0];
          const httpRequest: HttpRequest = {
            method: request.method ?? 'GET',
            path: parsedPath,
            headers: normaliseHeaders(request),
            body,
          };

          const result = await handle(httpRequest);
          response.writeHead(result.status, result.headers);
          response.end(result.body);
        } catch (error) {
          // Never echo the error: it can carry row values (CLAUDE.md §15).
          console.error(
            `[sync] request failed (${error instanceof Error ? error.name : 'unknown'})`
          );
          if (!response.headersSent) {
            response.writeHead(500, { 'content-type': 'application/json' });
          }
          response.end(
            JSON.stringify({
              error: { code: 'internal_error', message: 'Request failed.' },
            })
          );
        }
      })();
    }
  );

  const host = process.env.SYNC_ALLOW_INSECURE_DEV_AUTH === 'true' ? '127.0.0.1' : (process.env.HOST ?? '127.0.0.1');
  server.listen(port, host, () => {
    console.log(`[sync] listening on :${port}`);
  });
}

// Start only when this file is the process entrypoint. Importing it — from a
// test, or from a deployment wrapper — must not bind a socket as a side
// effect. server/tsconfig.json emits CommonJS, so `require.main` is defined
// when the compiled file is run directly and is not this module when Jest
// loads it.
declare const require: { main?: unknown } | undefined;
declare const module: unknown;

const isProcessEntrypoint =
  typeof require !== 'undefined' &&
  typeof module !== 'undefined' &&
  require?.main === module;

if (isProcessEntrypoint) {
  main();
}
