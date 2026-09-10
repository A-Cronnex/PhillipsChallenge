/**
 * Builds a `pg` connection pool without importing `pg` at type level.
 *
 * `pg` is a dependency of server/package.json, not of the mobile app's
 * package.json — the app must never pull a Postgres driver into its bundle.
 * Loading it through `require` inside a function keeps the root
 * `tsc --noEmit` (which type-checks the whole repo, app and server together)
 * from needing the server's node_modules to be installed.
 *
 * The pool is returned as `SqlPool`, so nothing downstream is coupled to the
 * driver either.
 */
import type { SqlPool } from './sql-executor';

export interface PoolOptions {
  connectionString: string;
  /** Fail fast rather than hanging a sync request on an unreachable database. */
  connectionTimeoutMillis?: number;
  max?: number;
}

interface PgModule {
  Pool: new (options: Record<string, unknown>) => SqlPool;
}

export function createPostgresPool(options: PoolOptions): SqlPool {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pg = require('pg') as PgModule;
  return new pg.Pool({
    connectionString: options.connectionString,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5000,
    max: options.max ?? 10,
  });
}
