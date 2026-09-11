/**
 * Validation of a pull request.
 *
 * Same stance as `validate-change.ts`: the device is untrusted here. A scope
 * is an access-control statement — it decides which hospitals' records leave
 * the server — so it is bounded and type-checked before it reaches a query,
 * never passed through (CLAUDE.md §7, §15).
 */
import type { PullRegion, SyncPullRequest } from '../../../types/sync-contract';
import {
  MAX_PULL_CHANGES,
  MAX_PULL_KNOWN_SITES,
  MAX_PULL_REGIONS,
} from '../../../types/sync-contract';
import type { PullScope } from '../application/ports';
import { isUuid } from './validate-change';

export type PullValidation =
  | { ok: true; scope: PullScope; cursor: string | null; limit: number }
  | { ok: false; message: string };

/** A cursor is the server's own bigint sequence value, echoed back as a string. */
function isCursor(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{1,19}$/.test(value);
}

function validRegion(region: unknown): region is PullRegion {
  if (typeof region !== 'object' || region === null) return false;
  const bounds = (region as PullRegion).bounds;
  if (!Array.isArray(bounds) || bounds.length !== 4) return false;
  if (!bounds.every((value) => typeof value === 'number' && Number.isFinite(value))) return false;
  const [west, south, east, north] = bounds;
  return (
    west >= -180 && west <= 180 && east >= -180 && east <= 180 &&
    south >= -90 && south <= 90 && north >= -90 && north <= 90 &&
    // A box whose corners are inverted would silently match nothing; refusing
    // it is more useful than returning an empty page the device cannot explain.
    west <= east && south <= north
  );
}

export function validatePullRequest(
  body: Partial<SyncPullRequest>,
  userId: string
): PullValidation {
  if (body.cursor !== null && body.cursor !== undefined && !isCursor(body.cursor)) {
    return { ok: false, message: '"cursor" must be the value returned by a previous pull.' };
  }

  const regions = body.regions ?? [];
  if (!Array.isArray(regions) || regions.length > MAX_PULL_REGIONS) {
    return { ok: false, message: `"regions" must be an array of at most ${MAX_PULL_REGIONS} bounding boxes.` };
  }
  if (!regions.every(validRegion)) {
    return { ok: false, message: '"regions" contains an invalid bounding box.' };
  }

  const knownSiteIds = body.knownSiteIds ?? [];
  if (!Array.isArray(knownSiteIds) || knownSiteIds.length > MAX_PULL_KNOWN_SITES) {
    return { ok: false, message: `"knownSiteIds" must be an array of at most ${MAX_PULL_KNOWN_SITES} ids.` };
  }
  if (!knownSiteIds.every(isUuid)) {
    return { ok: false, message: '"knownSiteIds" must contain UUIDs.' };
  }

  // An empty scope is accepted. It yields no sites, equipment or observations
  // — the honest answer for a device that has downloaded no map region and
  // holds no site yet, and better than defaulting to "everything", which §10
  // forbids. It still yields the caller's own conversations, which are scoped
  // by owner rather than by place: §10 says "the current user **or** the
  // selected site", and a conversation belongs to a person.
  const limit = typeof body.limit === 'number' && Number.isInteger(body.limit) && body.limit > 0
    ? Math.min(body.limit, MAX_PULL_CHANGES)
    : MAX_PULL_CHANGES;

  return {
    ok: true,
    cursor: body.cursor ?? null,
    limit,
    scope: {
      regions: regions.map(({ bounds }) => ({
        west: bounds[0], south: bounds[1], east: bounds[2], north: bounds[3],
      })),
      knownSiteIds,
      userId,
    },
  };
}
