/**
 * The minimum database surface the sync store needs.
 *
 * Declared structurally rather than importing `pg`, exactly as
 * `MigrationDatabase` is declared on the device side (database/migrator.ts):
 * the driver stays an infrastructure detail (CLAUDE.md §5), the store is
 * testable against a fake, and the root `tsc --noEmit` does not need `pg`
 * installed to check this code.
 *
 * `pg.Pool` and `pg.PoolClient` satisfy these interfaces as they are.
 */
export interface SqlQueryResult<R> {
  rows: R[];
  rowCount: number | null;
}

export interface SqlExecutor {
  query<R>(text: string, params?: readonly unknown[]): Promise<SqlQueryResult<R>>;
}

export interface SqlConnection extends SqlExecutor {
  release(): void;
}

export interface SqlPool extends SqlExecutor {
  connect(): Promise<SqlConnection>;
}

/**
 * Postgres SQLSTATE codes this layer distinguishes.
 *
 * The distinction that matters is retryable vs. not: a missing foreign key is
 * a record that has not been uploaded *yet*, while a CHECK violation is a
 * value that will be refused every time. Treating the second as retryable
 * would make the device retry a doomed record forever.
 */
export const SQLSTATE = {
  FOREIGN_KEY_VIOLATION: '23503',
  UNIQUE_VIOLATION: '23505',
  CHECK_VIOLATION: '23514',
  NOT_NULL_VIOLATION: '23502',
  INVALID_TEXT_REPRESENTATION: '22P02',
  NUMERIC_VALUE_OUT_OF_RANGE: '22003',
  DATETIME_FIELD_OVERFLOW: '22008',
} as const;

interface DatabaseErrorShape {
  code?: unknown;
  constraint?: unknown;
  table?: unknown;
}

export function sqlErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as DatabaseErrorShape).code;
  return typeof code === 'string' ? code : null;
}

/**
 * The constraint name, when the driver reports one.
 *
 * Only the constraint and table names are ever read from a driver error.
 * `detail` and `message` are not: Postgres puts the offending values into
 * them, and those values are hospital data that must not reach a log or an
 * API response (CLAUDE.md §15).
 */
export function sqlErrorConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const constraint = (error as DatabaseErrorShape).constraint;
  return typeof constraint === 'string' ? constraint : null;
}
