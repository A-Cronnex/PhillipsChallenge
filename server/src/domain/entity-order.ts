/**
 * Ordering of changes within one batch.
 *
 * The device uploads whatever happens to be pending, in no particular order.
 * The central schema has foreign keys between those entities, so an
 * observation that arrives before the site it belongs to would be rejected for
 * a missing reference and left pending forever, even though its site was
 * sitting in the same request.
 *
 * Sorting by the dependency graph fixes that without any cross-record
 * transaction: each change is still applied independently (which is what makes
 * a batch resumable and partially successful), it just arrives after whatever
 * it points at.
 */
import type { SyncEntityType } from '../../../types/domain';

/**
 * Lower rank is applied first.
 *
 * - `site` depends on nothing.
 * - `equipment` references a site.
 * - `conversation` references a user, which is never synchronized and must
 *   already exist; ranked before observations only because an observation may
 *   reference a conversation.
 * - `observation` references a site, optionally an equipment record, and
 *   optionally a conversation — so it comes last.
 */
const RANK: Record<SyncEntityType, number> = {
  site: 0,
  equipment: 1,
  conversation: 2,
  observation: 3,
};

export function entityRank(entityType: SyncEntityType): number {
  return RANK[entityType];
}

/**
 * Returns a new array ordered by dependency rank.
 *
 * The sort is stable within a rank, so two changes to the same entity type
 * keep the order the device sent them in. That matters if a device ever queues
 * two versions of one record: applying them out of order would leave the older
 * one as the winner.
 */
export function orderChangesByDependency<T extends { entityType: SyncEntityType }>(
  changes: readonly T[]
): T[] {
  return changes
    .map((change, index) => ({ change, index }))
    .sort(
      (a, b) =>
        entityRank(a.change.entityType) - entityRank(b.change.entityType) ||
        a.index - b.index
    )
    .map((entry) => entry.change);
}
