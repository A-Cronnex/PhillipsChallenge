import type * as SQLite from 'expo-sqlite';

import type {
  ClaimedQueue,
  EntityRef,
  SyncQueueRepository,
} from '../../features/synchronization/application/ports';
import type {
  PendingChange,
  PendingPayload,
} from '../../features/synchronization/domain/pending-change';
import type { SyncEntityType, SyncOperation } from '../../types/domain';
import type {
  AttributeConfidencePayload,
  ObservationSourcePayload,
} from '../../types/sync-contract';

/**
 * SQLite implementation of the synchronization queue.
 *
 * Every statement in this file touches `sync_records` only, with one
 * exception: the reads that assemble an entity's payload for upload. Nothing
 * here writes, edits or deletes a business record. That restriction is the
 * reason a failed or half-finished run cannot damage the local dataset
 * (docs/offline-sync.md §3).
 */

interface SyncRecordRow {
  id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  operation: SyncOperation;
  local_version: number;
  server_version: number | null;
}

/** Keeps `last_error` from growing without bound in the local database. */
const MAX_ERROR_LENGTH = 500;

function truncate(message: string): string {
  return message.length <= MAX_ERROR_LENGTH
    ? message
    : `${message.slice(0, MAX_ERROR_LENGTH - 1)}…`;
}

function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ');
}

export function createSyncRepository(
  db: SQLite.SQLiteDatabase
): SyncQueueRepository {
  /**
   * Reads the current state of each claimed entity and shapes it for the wire.
   *
   * Four separate queries rather than one union: the tables have different
   * columns, and an observation additionally needs its children. Each runs
   * only when the batch actually contains that entity type.
   */
  async function loadPayloads(
    rows: SyncRecordRow[]
  ): Promise<Map<string, PendingPayload>> {
    const payloads = new Map<string, PendingPayload>();
    const idsByType = new Map<SyncEntityType, string[]>();
    for (const row of rows) {
      const list = idsByType.get(row.entity_type) ?? [];
      list.push(row.entity_id);
      idsByType.set(row.entity_type, list);
    }

    const siteIds = idsByType.get('site') ?? [];
    if (siteIds.length > 0) {
      const sites = await db.getAllAsync<{
        id: string;
        name: string;
        country: string | null;
        city: string | null;
        latitude: number | null;
        longitude: number | null;
        address: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id, name, country, city, latitude, longitude, address,
                created_at, updated_at
           FROM sites WHERE id IN (${placeholders(siteIds.length)})`,
        siteIds
      );
      for (const site of sites) {
        payloads.set(`site:${site.id}`, {
          name: site.name,
          country: site.country,
          city: site.city,
          latitude: site.latitude,
          longitude: site.longitude,
          address: site.address,
          createdAt: site.created_at,
          updatedAt: site.updated_at,
        });
      }
    }

    const equipmentIds = idsByType.get('equipment') ?? [];
    if (equipmentIds.length > 0) {
      const equipment = await db.getAllAsync<{
        id: string;
        site_id: string;
        brand: string | null;
        model: string | null;
        modality: string | null;
        quantity: number | null;
        installation_year: number | null;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id, site_id, brand, model, modality, quantity, installation_year,
                created_at, updated_at
           FROM equipment WHERE id IN (${placeholders(equipmentIds.length)})`,
        equipmentIds
      );
      for (const item of equipment) {
        payloads.set(`equipment:${item.id}`, {
          siteId: item.site_id,
          brand: item.brand,
          model: item.model,
          modality: item.modality,
          quantity: item.quantity,
          installationYear: item.installation_year,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        });
      }
    }

    const conversationIds = idsByType.get('conversation') ?? [];
    if (conversationIds.length > 0) {
      const conversations = await db.getAllAsync<{
        id: string;
        user_id: string;
        started_at: string;
        ended_at: string | null;
        status: string;
        transcript_reference: string | null;
        summary: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id, user_id, started_at, ended_at, status, transcript_reference,
                summary, created_at, updated_at
           FROM conversations WHERE id IN (${placeholders(conversationIds.length)})`,
        conversationIds
      );
      for (const conversation of conversations) {
        payloads.set(`conversation:${conversation.id}`, {
          userId: conversation.user_id,
          startedAt: conversation.started_at,
          endedAt: conversation.ended_at,
          // Safe cast: the column carries a CHECK constraint over exactly the
          // ConversationStatus values (migration 001).
          status: conversation.status as never,
          transcriptReference: conversation.transcript_reference,
          summary: conversation.summary,
          createdAt: conversation.created_at,
          updatedAt: conversation.updated_at,
        });
      }
    }

    const observationIds = idsByType.get('observation') ?? [];
    if (observationIds.length > 0) {
      const list = placeholders(observationIds.length);
      const observations = await db.getAllAsync<{
        id: string;
        site_id: string;
        equipment_id: string | null;
        conversation_id: string | null;
        visit_date: string;
        quantity: number | null;
        brand: string | null;
        model: string | null;
        modality: string | null;
        estimated_years_of_use: number | null;
        estimated_installation_year: number | null;
        operational_status: string | null;
        capture_source: string | null;
        notes: string | null;
        overall_confidence: string | null;
        created_by: string;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id, site_id, equipment_id, conversation_id, visit_date, quantity,
                brand, model, modality, estimated_years_of_use,
                estimated_installation_year, operational_status, capture_source,
                notes, overall_confidence, created_by, created_at, updated_at
           FROM observations WHERE id IN (${list})`,
        observationIds
      );

      // The children travel with their observation: they have no sync record
      // of their own (types/domain.ts) and are written atomically with it
      // (docs/database.md §12).
      const confidenceRows = await db.getAllAsync<{
        observation_id: string;
        attribute_name: string;
        confidence_level: string;
        attribute_status: string;
        source: string | null;
      }>(
        `SELECT observation_id, attribute_name, confidence_level, attribute_status,
                source
           FROM attribute_confidence
          WHERE observation_id IN (${list})
          ORDER BY attribute_name ASC`,
        observationIds
      );
      const sourceRows = await db.getAllAsync<{
        observation_id: string;
        source: string;
        reference: string | null;
      }>(
        `SELECT observation_id, source, reference
           FROM observation_sources
          WHERE observation_id IN (${list})
          ORDER BY created_at ASC, id ASC`,
        observationIds
      );

      const confidenceByObservation = new Map<string, AttributeConfidencePayload[]>();
      for (const row of confidenceRows) {
        const bucket = confidenceByObservation.get(row.observation_id) ?? [];
        bucket.push({
          attributeName: row.attribute_name,
          confidenceLevel: row.confidence_level as never,
          attributeStatus: row.attribute_status as never,
          source: row.source as never,
        });
        confidenceByObservation.set(row.observation_id, bucket);
      }

      const sourcesByObservation = new Map<string, ObservationSourcePayload[]>();
      for (const row of sourceRows) {
        const bucket = sourcesByObservation.get(row.observation_id) ?? [];
        bucket.push({ source: row.source as never, reference: row.reference });
        sourcesByObservation.set(row.observation_id, bucket);
      }

      for (const observation of observations) {
        payloads.set(`observation:${observation.id}`, {
          siteId: observation.site_id,
          equipmentId: observation.equipment_id,
          conversationId: observation.conversation_id,
          visitDate: observation.visit_date,
          quantity: observation.quantity,
          brand: observation.brand,
          model: observation.model,
          modality: observation.modality,
          estimatedYearsOfUse: observation.estimated_years_of_use,
          estimatedInstallationYear: observation.estimated_installation_year,
          operationalStatus: observation.operational_status,
          captureSource: observation.capture_source as never,
          notes: observation.notes,
          overallConfidence: observation.overall_confidence as never,
          createdBy: observation.created_by,
          createdAt: observation.created_at,
          updatedAt: observation.updated_at,
          attributeConfidence: confidenceByObservation.get(observation.id) ?? [],
          sources: sourcesByObservation.get(observation.id) ?? [],
        });
      }
    }

    return payloads;
  }

  return {
    async releaseStaleSyncing(at: string): Promise<number> {
      // The app is one process, so nothing can legitimately be `syncing` when
      // a run begins. Anything that is belongs to a run that was killed.
      const result = await db.runAsync(
        `UPDATE sync_records
            SET sync_status = 'pending', updated_at = ?
          WHERE sync_status = 'syncing'`,
        [at]
      );
      return result.changes;
    },

    async claimPendingChanges(limit: number, at: string): Promise<ClaimedQueue> {
      if (limit < 1) return { changes: [], orphaned: 0 };

      let rows: SyncRecordRow[] = [];

      // Selecting and claiming in one transaction so two callers cannot claim
      // the same rows. Uses idx_sync_records_sync_status.
      await db.withTransactionAsync(async () => {
        rows = await db.getAllAsync<SyncRecordRow>(
          `SELECT id, entity_type, entity_id, operation, local_version, server_version
             FROM sync_records
            WHERE sync_status IN ('pending', 'failed')
            ORDER BY created_at ASC, id ASC
            LIMIT ?`,
          [limit]
        );

        if (rows.length === 0) return;

        await db.runAsync(
          `UPDATE sync_records
              SET sync_status = 'syncing', last_attempt_at = ?, updated_at = ?
            WHERE id IN (${placeholders(rows.length)})`,
          [at, at, ...rows.map((row) => row.id)]
        );
      });

      if (rows.length === 0) return { changes: [], orphaned: 0 };

      const payloads = await loadPayloads(rows);
      const changes: PendingChange[] = [];
      let orphaned = 0;

      for (const row of rows) {
        const payload = payloads.get(`${row.entity_type}:${row.entity_id}`);

        if (!payload) {
          // `sync_records.entity_id` has no foreign key because it is
          // polymorphic (docs/database.md §17.6), so a queue row can outlive
          // its entity. Marked failed rather than deleted: deleting queue rows
          // to tidy up is how an unsynchronized record disappears without
          // anyone noticing (CLAUDE.md §6).
          orphaned += 1;
          await db.runAsync(
            `UPDATE sync_records
                SET sync_status = 'failed', last_error = ?, updated_at = ?
              WHERE id = ?`,
            [
              'El registro local referenciado ya no existe en este dispositivo.',
              at,
              row.id,
            ]
          );
          continue;
        }

        changes.push({
          entityType: row.entity_type,
          entityId: row.entity_id,
          operation: row.operation,
          localVersion: row.local_version,
          baseServerVersion: row.server_version,
          updatedAt: payload.updatedAt,
          payload,
        });
      }

      return { changes, orphaned };
    },

    async markSynchronized(
      ref: EntityRef,
      serverVersion: number,
      expectedLocalVersion: number,
      at: string
    ): Promise<boolean> {
      // The `local_version = ?` predicate is the guard: if the record was
      // edited while the upload was in flight its version has moved on, no row
      // matches, and the caller requeues instead of marking a superseded
      // version synchronized.
      const result = await db.runAsync(
        `UPDATE sync_records
            SET sync_status = 'synchronized',
                server_version = ?,
                last_error = NULL,
                last_attempt_at = ?,
                updated_at = ?
          WHERE entity_type = ? AND entity_id = ? AND local_version = ?`,
        [serverVersion, at, at, ref.entityType, ref.entityId, expectedLocalVersion]
      );
      return result.changes > 0;
    },

    async markFailed(ref: EntityRef, message: string, at: string): Promise<void> {
      await db.runAsync(
        `UPDATE sync_records
            SET sync_status = 'failed',
                last_error = ?,
                last_attempt_at = ?,
                updated_at = ?
          WHERE entity_type = ? AND entity_id = ?`,
        [truncate(message), at, at, ref.entityType, ref.entityId]
      );
    },

    async releaseToPending(ref: EntityRef, at: string): Promise<void> {
      // `last_error` is left alone. It records the last real failure
      // (docs/offline-sync.md §6); the status field is what says the record is
      // queued again.
      await db.runAsync(
        `UPDATE sync_records
            SET sync_status = 'pending', updated_at = ?
          WHERE entity_type = ? AND entity_id = ?`,
        [at, ref.entityType, ref.entityId]
      );
    },
  };
}
