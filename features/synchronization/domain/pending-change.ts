/**
 * The device's view of one queued change.
 *
 * A `sync_records` row on its own is only bookkeeping — entity type, id,
 * operation, versions. To upload it, the entity's current state has to be read
 * from its own table and attached. `PendingChange` is that pair, and it is
 * deliberately shaped like the wire `SyncChange` so no field is invented or
 * dropped between the queue and the request.
 */
import type { SyncEntityType, SyncOperation } from '../../../types/domain';
import type {
  ConversationPayload,
  EquipmentPayload,
  ObservationPayload,
  SitePayload,
  SyncChange,
} from '../../../types/sync-contract';

export type PendingPayload =
  | SitePayload
  | EquipmentPayload
  | ConversationPayload
  | ObservationPayload;

export interface PendingChange {
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperation;
  /** `sync_records.local_version` when the change was claimed. */
  localVersion: number;
  /** `sync_records.server_version`, or null if never synchronized. */
  baseServerVersion: number | null;
  updatedAt: string;
  payload: PendingPayload;
}

/** Identifies a change in a response, since results carry no ordering promise. */
export function changeKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

export function toSyncChange(change: PendingChange): SyncChange {
  return {
    entityType: change.entityType,
    entityId: change.entityId,
    operation: change.operation,
    localVersion: change.localVersion,
    baseServerVersion: change.baseServerVersion,
    updatedAt: change.updatedAt,
    payload: change.payload,
  };
}

/**
 * Splits a claimed queue into request-sized batches.
 *
 * Batching is what makes a run resumable (docs/offline-sync.md §7): if the
 * connection drops after the second batch, the first two are already stored on
 * the server and only the rest have to be retried.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error('chunk size must be at least 1');
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
