/**
 * The batch behind `POST /v1/sync`.
 *
 * Three properties this file exists to guarantee, all from
 * docs/offline-sync.md §6–§8:
 *
 * - **Per-record outcomes.** One bad record must not fail the batch, or a
 *   single permanently-invalid row would block every other record on the
 *   device forever. Each change is applied in its own transaction and gets its
 *   own result (docs/architecture.md §11).
 * - **Idempotency.** A replayed change is recognised and reported with the
 *   outcome it originally got, rather than applied twice.
 * - **Client-wins, but never silently.** A diverged record is overwritten, and
 *   the response says so explicitly.
 */
import type { SyncEntityType } from '../../../types/domain';
import {
  MAX_CHANGES_PER_BATCH,
  type SyncErrorResponse,
  type SyncRequest,
  type SyncResponse,
  type SyncResult,
} from '../../../types/sync-contract';
import { decideSync } from '../domain/conflict';
import { orderChangesByDependency } from '../domain/entity-order';
import {
  validateChange,
  type Principal,
  type ValidatedChange,
} from '../validation/validate-change';
import type { SyncServiceDeps } from './ports';

export type SyncServiceResult =
  | { status: 'ok'; response: SyncResponse }
  | { status: 'error'; error: SyncErrorResponse['error'] };

interface PreparedChange {
  entityType: SyncEntityType;
  entityId: string;
  change: ValidatedChange;
}

function entityKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/**
 * Applies one uploaded batch.
 *
 * `principal` is the already-authenticated caller. Authentication itself is
 * not decided yet (CLAUDE.md §18) and is deliberately not performed here — see
 * server/src/http/authentication.ts.
 */
export async function synchronizeBatch(
  request: SyncRequest,
  principal: Principal,
  deps: SyncServiceDeps
): Promise<SyncServiceResult> {
  if (!Array.isArray(request.changes)) {
    return {
      status: 'error',
      error: { code: 'malformed_request', message: '"changes" must be an array.' },
    };
  }

  if (request.changes.length > MAX_CHANGES_PER_BATCH) {
    // Rejecting the whole request, not truncating it: truncating would report
    // success for a batch the client believes was fully accepted.
    return {
      status: 'error',
      error: {
        code: 'batch_too_large',
        message: `A batch may contain at most ${MAX_CHANGES_PER_BATCH} changes.`,
      },
    };
  }

  const receivedAt = deps.now().toISOString();
  const results: SyncResult[] = [];
  const prepared: PreparedChange[] = [];
  const seen = new Set<string>();

  for (const raw of request.changes) {
    const validation = validateChange(raw, principal);

    if (!validation.ok) {
      // The identity may itself be the invalid part, so fall back to whatever
      // the client sent rather than dropping the result: a change with no
      // result at all would leave the client unable to tell what happened.
      const identity = raw as Partial<{ entityType: SyncEntityType; entityId: string }>;
      results.push({
        entityType: identity?.entityType ?? 'observation',
        entityId: typeof identity?.entityId === 'string' ? identity.entityId : '',
        outcome: 'rejected',
        code: validation.failure.code,
        reason: validation.failure.reason,
      });
      continue;
    }

    const change = validation.value;
    const key = entityKey(change.entityType, change.entityId);
    if (seen.has(key)) {
      // The device holds exactly one sync record per entity
      // (UNIQUE (entity_type, entity_id)), so a duplicate here means a
      // malformed or hand-built request. Two changes for one entity would
      // also make the response ambiguous, since the client matches results by
      // entity.
      return {
        status: 'error',
        error: {
          code: 'malformed_request',
          message: `Duplicate change for ${change.entityType} ${change.entityId}.`,
        },
      };
    }
    seen.add(key);
    prepared.push({
      entityType: change.entityType,
      entityId: change.entityId,
      change,
    });
  }

  // Sites before the equipment that references them, observations last, so a
  // batch that carries a record and its dependencies applies in one pass.
  for (const item of orderChangesByDependency(prepared)) {
    const outcome = await deps.store.applyChange(
      item.change,
      { deviceId: request.deviceId, receivedAt },
      (current) =>
        decideSync(current, {
          deviceId: request.deviceId,
          localVersion: item.change.localVersion,
          baseServerVersion: item.change.baseServerVersion,
        })
    );

    const identity = { entityType: item.entityType, entityId: item.entityId };

    if (outcome.status === 'missing_reference') {
      results.push({
        ...identity,
        outcome: 'rejected',
        code: 'missing_reference',
        reason: outcome.detail,
      });
      continue;
    }

    if (outcome.status === 'constraint_violation') {
      results.push({
        ...identity,
        outcome: 'rejected',
        code: 'invalid_payload',
        reason: outcome.detail,
      });
      continue;
    }

    if (outcome.status === 'storage_error') {
      results.push({
        ...identity,
        outcome: 'rejected',
        code: 'storage_error',
        reason: outcome.detail,
      });
      continue;
    }

    const decision = outcome.decision;

    if (decision.kind === 'replay') {
      results.push(
        decision.outcome === 'conflict_overwritten'
          ? {
              ...identity,
              outcome: 'conflict_overwritten',
              serverVersion: decision.serverVersion,
              // A replayed conflict reports the version it originally
              // replaced. `?? 0` is unreachable for a stored conflict row,
              // whose previous version is always recorded.
              previousServerVersion: decision.previousServerVersion ?? 0,
              replayed: true,
            }
          : {
              ...identity,
              outcome: 'synchronized',
              serverVersion: decision.serverVersion,
              replayed: true,
            }
      );
      continue;
    }

    results.push(
      decision.overwrittenServerVersion === null
        ? {
            ...identity,
            outcome: 'synchronized',
            serverVersion: decision.nextServerVersion,
            replayed: false,
          }
        : {
            ...identity,
            outcome: 'conflict_overwritten',
            serverVersion: decision.nextServerVersion,
            previousServerVersion: decision.overwrittenServerVersion,
            replayed: false,
          }
    );
  }

  return {
    status: 'ok',
    response: { serverTime: receivedAt, results },
  };
}
