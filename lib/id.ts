import * as Crypto from 'expo-crypto';

/**
 * Generates a stable identifier for a locally created entity
 * (docs/database.md §5).
 *
 * UUIDs are generated on the device so a record keeps the same id after it
 * synchronizes, which is what makes retrying an upload idempotent rather than
 * duplicating the record (docs/offline-sync.md §7).
 */
export function newId(): string {
  return Crypto.randomUUID();
}
