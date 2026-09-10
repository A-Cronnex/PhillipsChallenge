import type * as SQLite from 'expo-sqlite';

import type {
  ObservationRepository,
  SavedObservation,
} from '../../features/observations/application/ports';
import type { NewObservation } from '../../features/observations/domain/observation';
import type { ObservationRecord } from '../../features/observations/domain/observation-record';
import type { CaptureSource, ConfidenceLevel, SyncStatus } from '../../types/domain';

import { enqueueCreate } from './catalog-repository';

interface ObservationRecordRow {
  id: string;
  equipment_id: string | null;
  site_id: string;
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
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  sync_status: string | null;
}

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

    async listBySite(siteId: string): Promise<ObservationRecord[]> {
      // LEFT JOIN sync_records: every observation gets one in the same
      // transaction that creates it (writeObservation above), but reading
      // this defensively rather than assuming it costs nothing and avoids an
      // observation silently vanishing from the list if that ever isn't true.
      // LEFT JOIN users: created_by is NOT NULL on observations, but the user
      // row it names could in principle be absent from a synced-down dataset.
      const rows = await db.getAllAsync<ObservationRecordRow>(
        `SELECT o.id,
                o.equipment_id,
                o.site_id,
                o.visit_date,
                o.quantity,
                o.brand,
                o.model,
                o.modality,
                o.estimated_years_of_use,
                o.estimated_installation_year,
                o.operational_status,
                o.capture_source,
                o.notes,
                o.overall_confidence,
                o.created_by,
                u.name AS created_by_name,
                o.created_at,
                o.updated_at,
                sr.sync_status
           FROM observations o
           LEFT JOIN users u ON u.id = o.created_by
           LEFT JOIN sync_records sr
                  ON sr.entity_type = 'observation' AND sr.entity_id = o.id
          WHERE o.site_id = ?
          ORDER BY o.visit_date DESC, o.created_at DESC`,
        [siteId]
      );

      return rows.map((row) => ({
        id: row.id,
        equipmentId: row.equipment_id,
        siteId: row.site_id,
        visitDate: row.visit_date,
        quantity: row.quantity,
        brand: row.brand,
        model: row.model,
        modality: row.modality,
        estimatedYearsOfUse: row.estimated_years_of_use,
        estimatedInstallationYear: row.estimated_installation_year,
        operationalStatus: row.operational_status,
        captureSource: row.capture_source as CaptureSource | null,
        notes: row.notes,
        overallConfidence: row.overall_confidence as ConfidenceLevel | null,
        createdBy: row.created_by,
        createdByName: row.created_by_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        syncStatus: row.sync_status as SyncStatus | null,
      }));
    },
  };
}
