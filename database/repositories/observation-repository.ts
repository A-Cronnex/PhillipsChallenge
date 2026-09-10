import type * as SQLite from 'expo-sqlite';

import type {
  ObservationRepository,
  SavedObservation,
} from '../../features/observations/application/ports';
import type { NewObservation } from '../../features/observations/domain/observation';
import type { SyncStatus } from '../../types/domain';

import { enqueueCreate } from './catalog-repository';

/** Runs inside the caller's transaction: equipment, observation, children and queue commit together. */
export async function writeObservation(db: SQLite.SQLiteDatabase, newId: () => string,
  observation: NewObservation, initialSyncStatus: SyncStatus): Promise<void> {
  let equipmentId = observation.equipmentId;
  if (equipmentId) {
    const equipment = await db.getFirstAsync<{ site_id: string }>('SELECT site_id FROM equipment WHERE id = ?', [equipmentId]);
    if (!equipment || equipment.site_id !== observation.siteId) {
      throw new Error('El equipo seleccionado no pertenece al sitio de la observación.');
    }
  } else {
    const duplicate = await db.getFirstAsync(`SELECT id FROM equipment WHERE site_id = ?
      AND lower(trim(coalesce(brand, ''))) = lower(trim(coalesce(?, '')))
      AND lower(trim(coalesce(model, ''))) = lower(trim(coalesce(?, '')))
      AND lower(trim(coalesce(modality, ''))) = lower(trim(coalesce(?, '')))`,
      [observation.siteId, observation.brand, observation.model, observation.modality]);
    if (duplicate) throw new Error('Ya existe un equipo con esa marca, modelo y modalidad en el sitio. Selecciónalo para añadir la observación a su historial.');
    equipmentId = newId();
    await db.runAsync(`INSERT INTO equipment (id, site_id, brand, model, modality, quantity, installation_year, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [equipmentId, observation.siteId, observation.brand, observation.model,
      observation.modality, observation.quantity, observation.estimatedInstallationYear, observation.createdAt, observation.createdAt]);
    await enqueueCreate(db, newId, 'equipment', equipmentId, observation.createdAt);
  }
  await db.runAsync(
    `INSERT INTO observations (
       id, equipment_id, site_id, conversation_id, visit_date, quantity,
       brand, model, modality, estimated_years_of_use,
       estimated_installation_year, operational_status, capture_source,
       notes, overall_confidence, created_by, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      observation.id,
      equipmentId,
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
}
export function createObservationRepository(db: SQLite.SQLiteDatabase, newId: () => string): ObservationRepository {
  return {
    async save(observation, initialSyncStatus): Promise<SavedObservation> {
      await db.withExclusiveTransactionAsync(async tx => {
        await writeObservation(tx, newId, observation, initialSyncStatus);
      });
      return { id: observation.id, syncStatus: initialSyncStatus, createdAt: observation.createdAt };
    },
  };
}
