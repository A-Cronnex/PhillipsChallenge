/**
 * Postgres implementation of `SyncStore`.
 *
 * One change, one transaction. Batching every change into a single
 * transaction would be faster but would undo per-record outcomes: one bad
 * record would roll back the good ones, and the device would re-upload
 * everything on the next run (docs/offline-sync.md §6, §10).
 *
 * The transaction does four things in a fixed order:
 *
 *   1. take an advisory lock on the entity key;
 *   2. read the current sync state and hand it to the injected decision;
 *   3. if the decision reports an overwrite, archive the state being replaced;
 *   4. write the payload and record the new sync state.
 *
 * Step 1 is not optional. `SELECT ... FOR UPDATE` locks nothing when the row
 * does not exist yet, so two devices creating or updating the same entity
 * concurrently would both read "no state" and both compute version 1. An
 * advisory lock keyed on the entity serialises them even on first insert, and
 * is released when the transaction ends.
 */
import type { SyncEntityType } from '../../../../types/domain';
import type {
  ConversationPayload,
  EquipmentPayload,
  ObservationPayload,
  SitePayload,
} from '../../../../types/sync-contract';
import type { ApplyContext, ApplyOutcome, SyncStore } from '../../application/ports';
import type { EntitySyncState, SyncDecision } from '../../domain/conflict';
import type { ValidatedChange } from '../../validation/validate-change';
import {
  SQLSTATE,
  sqlErrorCode,
  sqlErrorConstraint,
  type SqlConnection,
  type SqlPool,
} from './sql-executor';

interface SyncStateRow {
  server_version: number;
  last_applied_device_id: string;
  last_applied_local_version: number;
  last_outcome: 'synchronized' | 'conflict_overwritten';
  last_previous_version: number | null;
}

interface SnapshotRow {
  state: unknown;
}

/** Fixed per entity type, never interpolated from request data. */
const SNAPSHOT_SQL: Record<SyncEntityType, string> = {
  site: `SELECT to_jsonb(t) AS state FROM sites t WHERE t.id = $1`,
  equipment: `SELECT to_jsonb(t) AS state FROM equipment t WHERE t.id = $1`,
  conversation: `SELECT to_jsonb(t) AS state FROM conversations t WHERE t.id = $1`,
  // An observation's children are part of what is being replaced, so they are
  // part of what has to be archived (docs/offline-sync.md §11).
  observation: `
    SELECT jsonb_build_object(
             'observation', to_jsonb(o),
             'attributeConfidence', COALESCE(
               (SELECT jsonb_agg(to_jsonb(ac) ORDER BY ac.attribute_name)
                  FROM attribute_confidence ac
                 WHERE ac.observation_id = o.id), '[]'::jsonb),
             'sources', COALESCE(
               (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id)
                  FROM observation_sources s
                 WHERE s.observation_id = o.id), '[]'::jsonb)
           ) AS state
      FROM observations o
     WHERE o.id = $1`,
};

async function upsertSite(
  tx: SqlConnection,
  id: string,
  payload: SitePayload
): Promise<void> {
  await tx.query(
    `INSERT INTO sites (id, name, country, city, latitude, longitude, address,
                        created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            country = EXCLUDED.country,
            city = EXCLUDED.city,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            address = EXCLUDED.address,
            updated_at = EXCLUDED.updated_at`,
    [
      id,
      payload.name,
      payload.country,
      payload.city,
      payload.latitude,
      payload.longitude,
      payload.address,
      payload.createdAt,
      payload.updatedAt,
    ]
  );
}

async function upsertEquipment(
  tx: SqlConnection,
  id: string,
  payload: EquipmentPayload
): Promise<void> {
  await tx.query(
    `INSERT INTO equipment (id, site_id, brand, model, modality, quantity,
                            installation_year, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE
        SET site_id = EXCLUDED.site_id,
            brand = EXCLUDED.brand,
            model = EXCLUDED.model,
            modality = EXCLUDED.modality,
            quantity = EXCLUDED.quantity,
            installation_year = EXCLUDED.installation_year,
            updated_at = EXCLUDED.updated_at`,
    [
      id,
      payload.siteId,
      payload.brand,
      payload.model,
      payload.modality,
      payload.quantity,
      payload.installationYear,
      payload.createdAt,
      payload.updatedAt,
    ]
  );
}

async function upsertConversation(
  tx: SqlConnection,
  id: string,
  payload: ConversationPayload
): Promise<void> {
  await tx.query(
    `INSERT INTO conversations (id, user_id, started_at, ended_at, status,
                                transcript_reference, summary, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            started_at = EXCLUDED.started_at,
            ended_at = EXCLUDED.ended_at,
            status = EXCLUDED.status,
            transcript_reference = EXCLUDED.transcript_reference,
            summary = EXCLUDED.summary,
            updated_at = EXCLUDED.updated_at`,
    [
      id,
      payload.userId,
      payload.startedAt,
      payload.endedAt,
      payload.status,
      payload.transcriptReference,
      payload.summary,
      payload.createdAt,
      payload.updatedAt,
    ]
  );
}

async function upsertObservation(
  tx: SqlConnection,
  id: string,
  payload: ObservationPayload
): Promise<void> {
  await tx.query(
    `INSERT INTO observations (id, equipment_id, site_id, conversation_id, visit_date,
                               quantity, brand, model, modality, estimated_years_of_use,
                               estimated_installation_year, operational_status,
                               capture_source, notes, overall_confidence, created_by,
                               created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     ON CONFLICT (id) DO UPDATE
        SET equipment_id = EXCLUDED.equipment_id,
            site_id = EXCLUDED.site_id,
            conversation_id = EXCLUDED.conversation_id,
            visit_date = EXCLUDED.visit_date,
            quantity = EXCLUDED.quantity,
            brand = EXCLUDED.brand,
            model = EXCLUDED.model,
            modality = EXCLUDED.modality,
            estimated_years_of_use = EXCLUDED.estimated_years_of_use,
            estimated_installation_year = EXCLUDED.estimated_installation_year,
            operational_status = EXCLUDED.operational_status,
            capture_source = EXCLUDED.capture_source,
            notes = EXCLUDED.notes,
            overall_confidence = EXCLUDED.overall_confidence,
            updated_at = EXCLUDED.updated_at`,
    [
      id,
      payload.equipmentId,
      payload.siteId,
      payload.conversationId,
      payload.visitDate,
      payload.quantity,
      payload.brand,
      payload.model,
      payload.modality,
      payload.estimatedYearsOfUse,
      payload.estimatedInstallationYear,
      payload.operationalStatus,
      payload.captureSource,
      payload.notes,
      payload.overallConfidence,
      payload.createdBy,
      payload.createdAt,
      payload.updatedAt,
    ]
  );

  // `created_by` is intentionally NOT in the DO UPDATE list: authorship is
  // audit information and must survive an update (CLAUDE.md §9). A device
  // trying to change it silently is a no-op rather than a rewrite of history.

  // Children are replaced wholesale rather than merged. They carry no
  // server-side identity of their own (they have no sync record —
  // types/domain.ts), so "which row is which" is not answerable across two
  // uploads; replacing them keeps them exactly consistent with the parent that
  // was just written.
  await tx.query(`DELETE FROM attribute_confidence WHERE observation_id = $1`, [id]);
  for (const record of payload.attributeConfidence) {
    await tx.query(
      `INSERT INTO attribute_confidence (observation_id, attribute_name,
                                         confidence_level, attribute_status, source)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        record.attributeName,
        record.confidenceLevel,
        record.attributeStatus,
        record.source,
      ]
    );
  }

  await tx.query(`DELETE FROM observation_sources WHERE observation_id = $1`, [id]);
  for (const source of payload.sources) {
    await tx.query(
      `INSERT INTO observation_sources (observation_id, source, reference)
       VALUES ($1, $2, $3)`,
      [id, source.source, source.reference]
    );
  }
}

async function writePayload(
  tx: SqlConnection,
  change: ValidatedChange
): Promise<void> {
  switch (change.entityType) {
    case 'site':
      return upsertSite(tx, change.entityId, change.payload as SitePayload);
    case 'equipment':
      return upsertEquipment(tx, change.entityId, change.payload as EquipmentPayload);
    case 'conversation':
      return upsertConversation(
        tx,
        change.entityId,
        change.payload as ConversationPayload
      );
    case 'observation':
      return upsertObservation(
        tx,
        change.entityId,
        change.payload as ObservationPayload
      );
  }
}

/**
 * Turns a driver error into an outcome the client can act on.
 *
 * Only the SQLSTATE and the constraint name are read. The driver's `detail`
 * and `message` embed the offending values, which are hospital data
 * (CLAUDE.md §15), so the reason returned here is composed from the code
 * alone.
 */
function classify(error: unknown): ApplyOutcome {
  const code = sqlErrorCode(error);
  const constraint = sqlErrorConstraint(error);

  if (code === SQLSTATE.FOREIGN_KEY_VIOLATION) {
    return {
      status: 'missing_reference',
      detail:
        `A referenced record does not exist on the server yet` +
        `${constraint ? ` (${constraint})` : ''}. It will succeed once that ` +
        `record has been synchronized.`,
    };
  }

  if (
    code === SQLSTATE.CHECK_VIOLATION ||
    code === SQLSTATE.NOT_NULL_VIOLATION ||
    code === SQLSTATE.UNIQUE_VIOLATION ||
    code === SQLSTATE.INVALID_TEXT_REPRESENTATION ||
    code === SQLSTATE.NUMERIC_VALUE_OUT_OF_RANGE ||
    code === SQLSTATE.DATETIME_FIELD_OVERFLOW
  ) {
    return {
      status: 'constraint_violation',
      detail:
        `The central database refused this record` +
        `${constraint ? ` (${constraint})` : ''}. Retrying it unchanged will ` +
        `fail again.`,
    };
  }

  return {
    status: 'storage_error',
    detail: 'The server could not store this record. It can be retried.',
  };
}

export interface PostgresSyncStoreDeps {
  pool: SqlPool;
  logError?: (message: string) => void;
}

export function createPostgresSyncStore(deps: PostgresSyncStoreDeps): SyncStore {
  return {
    async applyChange(
      change: ValidatedChange,
      context: ApplyContext,
      decide: (current: EntitySyncState | null) => SyncDecision
    ): Promise<ApplyOutcome> {
      const tx = await deps.pool.connect();
      let inTransaction = false;

      try {
        await tx.query('BEGIN');
        inTransaction = true;

        await tx.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
          [`${change.entityType}:${change.entityId}`]
        );

        const stateResult = await tx.query<SyncStateRow>(
          `SELECT server_version, last_applied_device_id, last_applied_local_version,
                  last_outcome, last_previous_version
             FROM sync_entity_state
            WHERE entity_type = $1 AND entity_id = $2`,
          [change.entityType, change.entityId]
        );

        const row = stateResult.rows[0];
        const current: EntitySyncState | null = row
          ? {
              serverVersion: row.server_version,
              lastAppliedDeviceId: row.last_applied_device_id,
              lastAppliedLocalVersion: row.last_applied_local_version,
              lastOutcome: row.last_outcome,
              lastPreviousVersion: row.last_previous_version,
            }
          : null;

        const decision = decide(current);

        if (decision.kind === 'replay') {
          // Nothing is written. Committing an empty transaction rather than
          // rolling back keeps the advisory lock semantics identical on both
          // paths and costs nothing.
          await tx.query('COMMIT');
          inTransaction = false;
          return { status: 'ok', decision };
        }

        if (decision.overwrittenServerVersion !== null) {
          const snapshot = await tx.query<SnapshotRow>(
            SNAPSHOT_SQL[change.entityType],
            [change.entityId]
          );
          // `?? {}` covers a sync-state row whose business row is missing —
          // only reachable if the central database was edited out of band.
          // Archiving an empty object still records that an overwrite
          // happened, which is the part that must not be lost.
          await tx.query(
            `INSERT INTO sync_conflicts (entity_type, entity_id,
                                         overwritten_server_version, overwritten_state,
                                         resolved_by_device_id, resolved_by_local_version,
                                         resolution, detected_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'client_wins', $7)`,
            [
              change.entityType,
              change.entityId,
              decision.overwrittenServerVersion,
              JSON.stringify(snapshot.rows[0]?.state ?? {}),
              context.deviceId,
              change.localVersion,
              context.receivedAt,
            ]
          );
        }

        await writePayload(tx, change);

        await tx.query(
          `INSERT INTO sync_entity_state (entity_type, entity_id, server_version,
                                          last_applied_device_id, last_applied_local_version,
                                          last_outcome, last_previous_version, last_applied_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (entity_type, entity_id) DO UPDATE
              SET server_version = EXCLUDED.server_version,
                  last_applied_device_id = EXCLUDED.last_applied_device_id,
                  last_applied_local_version = EXCLUDED.last_applied_local_version,
                  last_outcome = EXCLUDED.last_outcome,
                  last_previous_version = EXCLUDED.last_previous_version,
                  last_applied_at = EXCLUDED.last_applied_at`,
          [
            change.entityType,
            change.entityId,
            decision.nextServerVersion,
            context.deviceId,
            change.localVersion,
            decision.overwrittenServerVersion === null
              ? 'synchronized'
              : 'conflict_overwritten',
            decision.overwrittenServerVersion,
            context.receivedAt,
          ]
        );

        await tx.query('COMMIT');
        inTransaction = false;
        return { status: 'ok', decision };
      } catch (error) {
        if (inTransaction) {
          try {
            await tx.query('ROLLBACK');
          } catch {
            // The connection is already unusable; releasing it is enough.
          }
        }
        deps.logError?.(
          `sync store: ${change.entityType} rejected (sqlstate ` +
            `${sqlErrorCode(error) ?? 'unknown'})`
        );
        return classify(error);
      } finally {
        tx.release();
      }
    },
  };
}
