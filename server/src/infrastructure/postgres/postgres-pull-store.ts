/**
 * Reads a page of changes for the download direction.
 *
 * Read-only: this store never writes. That is what lets the pull run against a
 * replica later without touching the upload path, and it keeps the one place
 * that mutates central state (`postgres-sync-store.ts`) unchanged.
 *
 * The scope is applied inside SQL, not filtered in JavaScript afterwards.
 * Fetching everything and discarding the out-of-scope rows would put records
 * from hospitals the device is not entitled to into the server's memory and
 * into any query log (CLAUDE.md §15).
 */
import type { PulledChange } from '../../../../types/sync-contract';
import type { SyncEntityType } from '../../../../types/domain';
import type { PullPage, PullScope, SyncPullStore } from '../../application/ports';
import type { SqlExecutor } from './sql-executor';

interface ChangeRow {
  entity_type: SyncEntityType;
  entity_id: string;
  server_version: number;
  change_seq: string;
}

/** `sites` whose id the device already holds, or that fall in a downloaded region. */
const SCOPED_SITES = `
  scoped_sites AS (
    SELECT s.id
      FROM sites s
     WHERE s.id = ANY($2::uuid[])
        OR EXISTS (
             SELECT 1
               FROM unnest($3::float8[], $4::float8[], $5::float8[], $6::float8[])
                      AS region(west, south, east, north)
              WHERE s.latitude IS NOT NULL
                AND s.longitude IS NOT NULL
                AND s.latitude BETWEEN region.south AND region.north
                AND s.longitude BETWEEN region.west AND region.east
           )
  )`;

/**
 * One page of the global change sequence, restricted to the scope.
 *
 * `change_seq > $1` with `ORDER BY change_seq` is the whole cursor protocol:
 * strictly greater, so a page is never re-delivered, and ordered, so a partial
 * application still leaves the device at a consistent cursor.
 */
const PAGE_SQL = `
  WITH ${SCOPED_SITES}
  SELECT st.entity_type, st.entity_id, st.server_version, st.change_seq::text AS change_seq
    FROM sync_entity_state st
   WHERE st.change_seq > $1
     AND (
          (st.entity_type = 'site'
            AND st.entity_id IN (SELECT id FROM scoped_sites))
       OR (st.entity_type = 'equipment'
            AND st.entity_id IN (SELECT e.id FROM equipment e
                                  WHERE e.site_id IN (SELECT id FROM scoped_sites)))
       OR (st.entity_type = 'observation'
            AND st.entity_id IN (SELECT o.id FROM observations o
                                  WHERE o.site_id IN (SELECT id FROM scoped_sites)))
       -- Conversations are uploaded but never downloaded (product decision,
       -- 2026-09-11). The server keeps them as the provenance of each
       -- observation (docs/domain-model.md §12), which is where that record is
       -- actually useful; sending them back made a device unable to discard
       -- its own chat, because the next pull simply restored it.
     )
   ORDER BY st.change_seq
   LIMIT $7`;

const SITE_SQL = `
  SELECT id, name, country, city, latitude, longitude, address, created_at, updated_at
    FROM sites WHERE id = ANY($1::uuid[])`;

const EQUIPMENT_SQL = `
  SELECT id, site_id, brand, model, modality, quantity, installation_year, created_at, updated_at
    FROM equipment WHERE id = ANY($1::uuid[])`;

const CONVERSATION_SQL = `
  SELECT id, user_id, started_at, ended_at, status, transcript_reference, summary, created_at, updated_at
    FROM conversations WHERE id = ANY($1::uuid[])`;

const OBSERVATION_SQL = `
  SELECT o.id, o.site_id, o.equipment_id, o.conversation_id, o.visit_date, o.quantity,
         o.brand, o.model, o.modality, o.estimated_years_of_use, o.estimated_installation_year,
         o.operational_status, o.capture_source, o.notes, o.overall_confidence,
         o.created_by, o.created_at, o.updated_at
    FROM observations o WHERE o.id = ANY($1::uuid[])`;

const ATTRIBUTES_SQL = `
  SELECT observation_id, attribute_name, confidence_level, attribute_status, source
    FROM attribute_confidence WHERE observation_id = ANY($1::uuid[])`;

const SOURCES_SQL = `
  SELECT observation_id, source, reference
    FROM observation_sources WHERE observation_id = ANY($1::uuid[])`;

/** Timestamps leave Postgres as `Date`; the wire is ISO-8601 UTC strings. */
function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function isoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}

export function createPostgresPullStore(deps: { pool: SqlExecutor }): SyncPullStore {
  return {
    async readChanges(cursor, scope: PullScope, limit): Promise<PullPage> {
      // One extra row is the cheapest way to know whether another page exists
      // without a second COUNT over the same predicate.
      const page = await deps.pool.query<ChangeRow>(PAGE_SQL, [
        cursor ?? '0',
        scope.knownSiteIds,
        scope.regions.map((region) => region.west),
        scope.regions.map((region) => region.south),
        scope.regions.map((region) => region.east),
        scope.regions.map((region) => region.north),
        limit + 1,
      ]);

      const hasMore = page.rows.length > limit;
      const rows = hasMore ? page.rows.slice(0, limit) : page.rows;
      if (rows.length === 0) return { changes: [], cursor: cursor ?? '0', hasMore: false };

      const idsOf = (type: SyncEntityType) =>
        rows.filter((row) => row.entity_type === type).map((row) => row.entity_id);

      const [sites, equipment, conversations, observations] = await Promise.all([
        idsOf('site').length ? deps.pool.query<Record<string, unknown>>(SITE_SQL, [idsOf('site')]) : { rows: [] },
        idsOf('equipment').length ? deps.pool.query<Record<string, unknown>>(EQUIPMENT_SQL, [idsOf('equipment')]) : { rows: [] },
        idsOf('conversation').length ? deps.pool.query<Record<string, unknown>>(CONVERSATION_SQL, [idsOf('conversation')]) : { rows: [] },
        idsOf('observation').length ? deps.pool.query<Record<string, unknown>>(OBSERVATION_SQL, [idsOf('observation')]) : { rows: [] },
      ]);

      const observationIds = observations.rows.map((row) => String(row.id));
      const [attributes, sources] = await Promise.all([
        observationIds.length ? deps.pool.query<Record<string, unknown>>(ATTRIBUTES_SQL, [observationIds]) : { rows: [] },
        observationIds.length ? deps.pool.query<Record<string, unknown>>(SOURCES_SQL, [observationIds]) : { rows: [] },
      ]);

      const byId = new Map<string, Record<string, unknown>>();
      for (const set of [sites, equipment, conversations, observations]) {
        for (const row of set.rows) byId.set(String(row.id), row);
      }

      const childrenOf = (set: { rows: Record<string, unknown>[] }, id: string) =>
        set.rows.filter((row) => String(row.observation_id) === id);

      const payloadFor = (type: SyncEntityType, row: Record<string, unknown>): PulledChange['payload'] => {
        if (type === 'site') {
          return {
            name: String(row.name), country: (row.country as string | null) ?? null,
            city: (row.city as string | null) ?? null,
            latitude: (row.latitude as number | null) ?? null,
            longitude: (row.longitude as number | null) ?? null,
            address: (row.address as string | null) ?? null,
            createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
          };
        }
        if (type === 'equipment') {
          return {
            siteId: String(row.site_id), brand: (row.brand as string | null) ?? null,
            model: (row.model as string | null) ?? null, modality: (row.modality as string | null) ?? null,
            quantity: (row.quantity as number | null) ?? null,
            installationYear: (row.installation_year as number | null) ?? null,
            createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
          };
        }
        if (type === 'conversation') {
          return {
            userId: String(row.user_id), startedAt: iso(row.started_at),
            endedAt: isoOrNull(row.ended_at),
            status: row.status as never,
            transcriptReference: (row.transcript_reference as string | null) ?? null,
            summary: (row.summary as string | null) ?? null,
            createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
          };
        }
        const id = String(row.id);
        return {
          siteId: String(row.site_id), equipmentId: (row.equipment_id as string | null) ?? null,
          conversationId: (row.conversation_id as string | null) ?? null,
          // `visit_date` is a DATE; only its calendar day is meaningful.
          visitDate: iso(row.visit_date).slice(0, 10),
          quantity: (row.quantity as number | null) ?? null,
          brand: (row.brand as string | null) ?? null, model: (row.model as string | null) ?? null,
          modality: (row.modality as string | null) ?? null,
          estimatedYearsOfUse: (row.estimated_years_of_use as number | null) ?? null,
          estimatedInstallationYear: (row.estimated_installation_year as number | null) ?? null,
          operationalStatus: (row.operational_status as string | null) ?? null,
          captureSource: (row.capture_source as never) ?? null,
          notes: (row.notes as string | null) ?? null,
          overallConfidence: (row.overall_confidence as never) ?? null,
          createdBy: String(row.created_by),
          createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
          attributeConfidence: childrenOf(attributes, id).map((child) => ({
            attributeName: String(child.attribute_name),
            confidenceLevel: child.confidence_level as never,
            attributeStatus: child.attribute_status as never,
            source: (child.source as never) ?? null,
          })),
          sources: childrenOf(sources, id).map((child) => ({
            source: child.source as never,
            reference: (child.reference as string | null) ?? null,
          })),
        };
      };

      const changes: PulledChange[] = [];
      for (const row of rows) {
        const entity = byId.get(row.entity_id);
        // `sync_entity_state` can outlive its business row only through manual
        // intervention, but skipping is the safe reading: a change with no
        // payload cannot be applied, and stalling the whole page on it would
        // block every later change behind it forever.
        if (!entity) continue;
        const payload = payloadFor(row.entity_type, entity);
        changes.push({
          entityType: row.entity_type, entityId: row.entity_id,
          serverVersion: row.server_version,
          updatedAt: (payload as { updatedAt: string }).updatedAt,
          payload,
        });
      }

      return { changes, cursor: rows[rows.length - 1].change_seq, hasMore };
    },
  };
}
