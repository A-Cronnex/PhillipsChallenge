/**
 * Ports the observation capture flow depends on.
 *
 * The application layer depends on these interfaces, never on `expo-sqlite`
 * or on anything in `database/` (docs/architecture.md §6, CLAUDE.md §5).
 * `database/repositories/` supplies the implementations.
 */
import type { SyncStatus } from '../../../types/domain';
import type { NewObservation } from '../domain/observation';
import type { ObservationRecord } from '../domain/observation-record';

export interface SavedObservation {
  id: string;
  /** The synchronization state the record was persisted with. */
  syncStatus: SyncStatus;
  createdAt: string;
}

export interface ObservationRepository {
  /**
   * Persists an observation together with its attribute-confidence rows, its
   * capture-source rows and its synchronization record.
   *
   * The implementation must write all of them in a single transaction
   * (docs/database.md §12): an observation that is saved without its sync
   * record would never be queued for upload, and would look synchronized
   * while existing only on the device.
   */
  save(
    observation: NewObservation,
    initialSyncStatus: SyncStatus
  ): Promise<SavedObservation>;

  /**
   * Every observation recorded at a site, for the observation-history screen
   * (docs/manual-capture.md §8 — previously "no listing of saved
   * observations"). Never performs a network call; reads what is locally
   * persisted, including rows not yet synchronized.
   */
  listBySite(siteId: string): Promise<ObservationRecord[]>;
}
