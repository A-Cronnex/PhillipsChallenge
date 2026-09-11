import type * as SQLite from 'expo-sqlite';

import type {
  AppliedPull,
  SyncDownloadRepository,
} from '../../features/synchronization/application/ports';
import type {
  ConversationPayload,
  EquipmentPayload,
  ObservationPayload,
  PulledChange,
  SitePayload,
} from '../../types/sync-contract';

/**
 * SQLite implementation of the download direction.
 *
 * This is the **only** repository that writes business records it did not get
 * from the user. `sync-repository.ts` deliberately never does — a failed
 * upload must not be able to damage the local dataset — so the risk is
 * concentrated here and bounded by three rules:
 *
 * 1. A page is applied in one transaction. A partially applied page would
 *    leave an observation pointing at a site that was never written.
 * 2. A record with an unsent local change is never overwritten. Client-wins
 *    (docs/offline-sync.md §8) makes the field device's copy authoritative
 *    until it has been uploaded; the server's version is skipped and reported.
 * 3. Nothing is deleted. The pull carries creates and updates only — the
 *    soft-delete strategy is still open (docs/database.md §16) — so this file
 *    has no DELETE in it at all.
 */

/** `local_settings` key for the server change sequence last applied. */
export const PULL_CURSOR_KEY = 'sync.pull_cursor';

/** Entities whose local row has a queued change the server has not seen yet. */
const PENDING_STATUSES = "('pending', 'syncing', 'failed')";

export function createSyncDownloadRepository(
  db: SQLite.SQLiteDatabase,
  newId: () => string
): SyncDownloadRepository {
  return {
    async getPullCursor(): Promise<string | null> {
      const row = await db.getFirstAsync<{ value: string }>(
        `SELECT value FROM local_settings WHERE key = ?`,
        [PULL_CURSOR_KEY]
      );
      return row?.value ?? null;
    },

    async setPullCursor(cursor: string, at: string): Promise<void> {
      await db.runAsync(
        `INSERT INTO local_settings (key, value, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [PULL_CURSOR_KEY, cursor, at, at]
      );
    },

    async listKnownSiteIds(): Promise<string[]> {
      const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM sites`);
      return rows.map((row) => row.id);
    },

    async listDownloadedRegionBounds(): Promise<[number, number, number, number][]> {
      // Only finished downloads. A region still downloading does not yet give
      // the user a usable map for that place, so pulling its business data
      // early would be data they cannot act on (docs/maps.md §15).
      const rows = await db.getAllAsync<{
        min_longitude: number; min_latitude: number; max_longitude: number; max_latitude: number;
      }>(
        `SELECT min_longitude, min_latitude, max_longitude, max_latitude
           FROM map_regions WHERE download_status = 'downloaded'`
      );
      return rows.map((row) => [row.min_longitude, row.min_latitude, row.max_longitude, row.max_latitude]);
    },

    async applyPulledChanges(changes: PulledChange[], at: string): Promise<AppliedPull> {
      const result: AppliedPull = { applied: 0, skipped: [] };
      if (changes.length === 0) return result;

      await db.withTransactionAsync(async () => {
        for (const change of changes) {
          // Rule 2. One query per change rather than one up front: an earlier
          // change in the same page can itself have queued a local row.
          const blocking = await db.getFirstAsync<{ count: number }>(
            `SELECT COUNT(*) AS count FROM sync_records
              WHERE entity_type = ? AND entity_id = ? AND sync_status IN ${PENDING_STATUSES}`,
            [change.entityType, change.entityId]
          );
          if ((blocking?.count ?? 0) > 0) {
            result.skipped.push({ entityType: change.entityType, entityId: change.entityId, reason: 'local_pending' });
            continue;
          }

          const wrote = await writeEntity(db, change);
          if (!wrote) {
            // A foreign key the page does not carry — most often an
            // observation whose site is outside this device's scope. Reported,
            // not retried forever: the cursor still advances, and the record
            // arrives if the scope later includes its site.
            result.skipped.push({ entityType: change.entityType, entityId: change.entityId, reason: 'missing_reference' });
            continue;
          }

          // The device now holds exactly the server's version. Recording it
          // means a later local edit uploads with the right
          // `baseServerVersion` and is not reported as a conflict.
          await db.runAsync(
            `INSERT INTO sync_records (id, entity_type, entity_id, operation, sync_status,
                                       server_version, local_version, created_at, updated_at)
             VALUES (?, ?, ?, 'update', 'synchronized', ?, 1, ?, ?)
             ON CONFLICT (entity_type, entity_id) DO UPDATE
                SET sync_status = 'synchronized',
                    server_version = excluded.server_version,
                    last_error = NULL,
                    updated_at = excluded.updated_at`,
            [newId(), change.entityType, change.entityId, change.serverVersion, at, at]
          );
          result.applied += 1;
        }
      });

      return result;
    },
  };
}

/** Returns false when a referenced row the local database needs is absent. */
async function writeEntity(db: SQLite.SQLiteDatabase, change: PulledChange): Promise<boolean> {
  const { entityId, payload } = change;

  if (change.entityType === 'site') {
    const site = payload as SitePayload;
    await db.runAsync(
      `INSERT INTO sites (id, name, country, city, latitude, longitude, address, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, country = excluded.country,
         city = excluded.city, latitude = excluded.latitude, longitude = excluded.longitude,
         address = excluded.address, updated_at = excluded.updated_at`,
      [entityId, site.name, site.country, site.city, site.latitude, site.longitude,
        site.address, site.createdAt, site.updatedAt]
    );
    return true;
  }

  if (change.entityType === 'equipment') {
    const equipment = payload as EquipmentPayload;
    if (!(await exists(db, 'sites', equipment.siteId))) return false;
    await db.runAsync(
      `INSERT INTO equipment (id, site_id, brand, model, modality, quantity, installation_year, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET site_id = excluded.site_id, brand = excluded.brand,
         model = excluded.model, modality = excluded.modality, quantity = excluded.quantity,
         installation_year = excluded.installation_year, updated_at = excluded.updated_at`,
      [entityId, equipment.siteId, equipment.brand, equipment.model, equipment.modality,
        equipment.quantity, equipment.installationYear, equipment.createdAt, equipment.updatedAt]
    );
    return true;
  }

  if (change.entityType === 'conversation') {
    const conversation = payload as ConversationPayload;
    if (!(await exists(db, 'users', conversation.userId))) return false;
    await db.runAsync(
      `INSERT INTO conversations (id, user_id, started_at, ended_at, status, transcript_reference, summary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET status = excluded.status, ended_at = excluded.ended_at,
         transcript_reference = excluded.transcript_reference, summary = excluded.summary,
         updated_at = excluded.updated_at`,
      [entityId, conversation.userId, conversation.startedAt, conversation.endedAt,
        conversation.status, conversation.transcriptReference, conversation.summary,
        conversation.createdAt, conversation.updatedAt]
    );
    return true;
  }

  const observation = payload as ObservationPayload;
  if (!(await exists(db, 'sites', observation.siteId))) return false;
  if (!(await exists(db, 'users', observation.createdBy))) return false;
  if (observation.equipmentId && !(await exists(db, 'equipment', observation.equipmentId))) return false;
  // Conversations are never downloaded (product decision, 2026-09-11), so a
  // pulled observation almost always names one this device does not have.
  // Dropping the whole observation for that would lose field data over a
  // provenance link; the link stays intact on the server, which is where the
  // audit lives. Stored null here rather than skipped.
  const conversationId = observation.conversationId
    && (await exists(db, 'conversations', observation.conversationId))
    ? observation.conversationId
    : null;

  await db.runAsync(
    `INSERT INTO observations (id, site_id, equipment_id, conversation_id, visit_date, quantity,
       brand, model, modality, estimated_years_of_use, estimated_installation_year,
       operational_status, capture_source, notes, overall_confidence, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET site_id = excluded.site_id, equipment_id = excluded.equipment_id,
       conversation_id = excluded.conversation_id, visit_date = excluded.visit_date,
       quantity = excluded.quantity, brand = excluded.brand, model = excluded.model,
       modality = excluded.modality, estimated_years_of_use = excluded.estimated_years_of_use,
       estimated_installation_year = excluded.estimated_installation_year,
       operational_status = excluded.operational_status, capture_source = excluded.capture_source,
       notes = excluded.notes, overall_confidence = excluded.overall_confidence,
       updated_at = excluded.updated_at`,
    [entityId, observation.siteId, observation.equipmentId, conversationId,
      observation.visitDate, observation.quantity, observation.brand, observation.model,
      observation.modality, observation.estimatedYearsOfUse, observation.estimatedInstallationYear,
      observation.operationalStatus, observation.captureSource, observation.notes,
      observation.overallConfidence, observation.createdBy, observation.createdAt, observation.updatedAt]
  );

  // Children are owned by the observation (docs/database.md §17.5), so they
  // are replaced wholesale rather than merged: the server's copy of an
  // observation is the complete statement of its confidence rows and sources.
  // This is the one place the file removes rows, and only rows it is about to
  // rewrite from the same payload.
  await db.runAsync(`DELETE FROM attribute_confidence WHERE observation_id = ?`, [entityId]);
  for (const attribute of observation.attributeConfidence) {
    await db.runAsync(
      // Only `created_at`: these child tables carry no `updated_at`
      // (database/migrations/001-initial-schema.ts). They are replaced whole,
      // so there is no in-place update whose time would need recording.
      `INSERT INTO attribute_confidence (id, observation_id, attribute_name, confidence_level,
         attribute_status, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`${entityId}:${attribute.attributeName}`, entityId, attribute.attributeName,
        attribute.confidenceLevel, attribute.attributeStatus, attribute.source,
        observation.updatedAt]
    );
  }

  await db.runAsync(`DELETE FROM observation_sources WHERE observation_id = ?`, [entityId]);
  for (const [index, source] of observation.sources.entries()) {
    await db.runAsync(
      `INSERT INTO observation_sources (id, observation_id, source, reference, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [`${entityId}:${index}`, entityId, source.source, source.reference, observation.updatedAt]
    );
  }

  return true;
}

async function exists(db: SQLite.SQLiteDatabase, table: 'sites' | 'users' | 'equipment' | 'conversations', id: string): Promise<boolean> {
  // The table name is a closed union, never a value from the wire — string
  // interpolation into SQL is safe only because of that (CLAUDE.md §7).
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM ${table} WHERE id = ?`,
    [id]
  );
  return (row?.count ?? 0) > 0;
}
