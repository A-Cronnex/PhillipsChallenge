import type * as SQLite from 'expo-sqlite';

import type {
  ObservationRepository,
  SavedObservation,
} from '../../features/observations/application/ports';
import type { NewObservation } from '../../features/observations/domain/observation';
import type { SyncStatus } from '../../types/domain';

/**
 * SQLite implementation of the observation capture port.
 *
 * This is the only place in the capture flow that knows SQL exists. Nothing
 * above it imports `expo-sqlite` (CLAUDE.md §5).
 */
export function createObservationRepository(
  db: SQLite.SQLiteDatabase,
  newId: () => string
): ObservationRepository {
  return {
    async save(
      observation: NewObservation,
      initialSyncStatus: SyncStatus
    ): Promise<SavedObservation> {
      // One transaction for the observation and every record that depends on
      // it (docs/database.md §12). If any statement fails the whole thing
      // rolls back, so the database never holds an observation without its
      // sync record — which would be a row that silently never synchronizes.
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO observations (
             id, equipment_id, site_id, conversation_id, visit_date, quantity,
             brand, model, modality, estimated_years_of_use,
             estimated_installation_year, operational_status, capture_source,
             notes, overall_confidence, created_by, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            observation.id,
            observation.equipmentId,
            observation.siteId,
            observation.conversationId,
            observation.visitDate,
            observation.quantity,
            observation.brand,
            observation.model,
            observation.modality,
            observation.estimatedYearsOfUse,
            observation.estimatedInstallationYear,
            observation.operationalStatus,
            observation.captureSource,
            observation.notes,
            observation.overallConfidence,
            observation.createdBy,
            observation.createdAt,
            observation.updatedAt,
          ]
        );

        for (const record of observation.attributeConfidence) {
          await db.runAsync(
            `INSERT INTO attribute_confidence (
               id, observation_id, attribute_name, confidence_level,
               attribute_status, source, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              newId(),
              observation.id,
              record.attributeName,
              record.confidenceLevel,
              record.attributeStatus,
              record.source,
              observation.createdAt,
            ]
          );
        }

        for (const source of observation.sources) {
          await db.runAsync(
            `INSERT INTO observation_sources (
               id, observation_id, source, reference, created_at
             ) VALUES (?, ?, ?, ?, ?)`,
            [
              newId(),
              observation.id,
              source.source,
              source.reference,
              observation.createdAt,
            ]
          );
        }

        await db.runAsync(
          `INSERT INTO sync_records (
             id, entity_type, entity_id, operation, sync_status,
             last_attempt_at, last_error, server_version, local_version,
             created_at, updated_at
           ) VALUES (?, 'observation', ?, 'create', ?, NULL, NULL, NULL, 1, ?, ?)`,
          [
            newId(),
            observation.id,
            initialSyncStatus,
            observation.createdAt,
            observation.createdAt,
          ]
        );
      });

      return {
        id: observation.id,
        syncStatus: initialSyncStatus,
        createdAt: observation.createdAt,
      };
    },
  };
}
