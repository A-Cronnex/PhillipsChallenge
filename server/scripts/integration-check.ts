/**
 * End-to-end check against a real PostgreSQL database.
 *
 * This is the coverage the Jest suite cannot provide: `tests/server/` runs the
 * store against a fake driver, so it verifies the order of statements but never
 * executes the SQL. Constraints, `ON CONFLICT` clauses, the advisory lock, and
 * the migration itself are only really tested here.
 *
 * It is not part of `npm test` because it needs a live database. Run it against
 * a scratch database:
 *
 *   createdb hei_check
 *   DATABASE_URL=postgres://user@localhost:5432/hei_check \
 *   SYNC_INTEGRATION_ALLOW_DESTRUCTIVE=true \
 *     npm run verify
 *
 * It TRUNCATEs every table it touches, so it refuses to run without the
 * explicit opt-in above (CLAUDE.md §9 — never modify production data).
 */
import { createSyncEndpoint } from '../src/http/sync-endpoint';
import { createPostgresSyncStore } from '../src/infrastructure/postgres/postgres-sync-store';
import { createPostgresPool } from '../src/infrastructure/postgres/pool';
import type { Authenticator } from '../src/http/authentication';
import { SYNC_ENDPOINT_PATH, type SyncResponse } from '../../types/sync-contract';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const DEVICE_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_DEVICE = '99999999-9999-4999-8999-999999999999';
const SITE_ID = '55555555-5555-4555-8555-555555555555';
const OBS_ID = '66666666-6666-4666-8666-666666666666';
const GHOST_SITE_ID = '77777777-7777-4777-8777-777777777777';

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}`);
    if (detail !== undefined) console.error(`       ${JSON.stringify(detail)}`);
  }
}

function sitePayload(name: string, updatedAt: string) {
  return {
    name,
    country: 'Panamá',
    city: 'Ciudad de Panamá',
    latitude: 8.98,
    longitude: -79.52,
    address: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt,
  };
}

function observationPayload(siteId: string, notes: string) {
  return {
    siteId,
    equipmentId: null,
    conversationId: null,
    visitDate: '2026-09-01',
    quantity: 2,
    brand: 'Philips',
    model: 'IntelliVue MX450',
    modality: 'Monitor',
    estimatedYearsOfUse: 3,
    estimatedInstallationYear: 2022,
    operationalStatus: 'operativo',
    captureSource: 'text',
    notes,
    overallConfidence: 'high',
    createdBy: USER_ID,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    attributeConfidence: [
      { attributeName: 'brand', confidenceLevel: 'high', attributeStatus: 'reported', source: 'text' },
      { attributeName: 'model', confidenceLevel: 'medium', attributeStatus: 'estimated', source: 'text' },
    ],
    sources: [{ source: 'text', reference: null }],
  };
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  if (process.env.SYNC_INTEGRATION_ALLOW_DESTRUCTIVE !== 'true') {
    console.error(
      'This check TRUNCATEs tables. Set SYNC_INTEGRATION_ALLOW_DESTRUCTIVE=true ' +
        'and point DATABASE_URL at a scratch database.'
    );
    process.exit(1);
  }

  const pool = createPostgresPool({ connectionString });
  const authenticator: Authenticator = {
    async authenticate() {
      return { authenticated: true, principal: { userId: USER_ID, deviceId: DEVICE_ID } };
    },
  };
  const handle = createSyncEndpoint({
    store: createPostgresSyncStore({ pool }),
    authenticator,
    now: () => new Date(),
  });

  async function post(
    changes: unknown[],
    deviceId = DEVICE_ID
  ): Promise<{ status: number; body: SyncResponse }> {
    const response = await handle({
      method: 'POST',
      path: SYNC_ENDPOINT_PATH,
      headers: {},
      body: JSON.stringify({ deviceId, clientTime: new Date().toISOString(), changes }),
    });
    return { status: response.status, body: JSON.parse(response.body) as SyncResponse };
  }

  const outcomeOf = (body: SyncResponse, entityId: string) =>
    body.results.find((result) => result.entityId === entityId);

  await pool.query(
    `TRUNCATE sync_conflicts, sync_entity_state, attribute_confidence,
              observation_sources, observations, conversations, equipment,
              sites, users RESTART IDENTITY CASCADE`
  );
  await pool.query(
    `INSERT INTO users (id, name, role) VALUES ($1, 'Field User', 'field_user')`,
    [USER_ID]
  );

  console.log('\n1. First upload, sent in the wrong order');
  {
    const { status, body } = await post([
      {
        entityType: 'observation',
        entityId: OBS_ID,
        operation: 'create',
        localVersion: 1,
        baseServerVersion: null,
        updatedAt: '2026-09-01T10:00:00.000Z',
        payload: observationPayload(SITE_ID, 'Dos monitores en emergencias.'),
      },
      {
        entityType: 'site',
        entityId: SITE_ID,
        operation: 'create',
        localVersion: 1,
        baseServerVersion: null,
        updatedAt: '2026-09-01T10:00:00.000Z',
        payload: sitePayload('Hospital Santo Tomás', '2026-09-01T10:00:00.000Z'),
      },
    ]);

    check('responds 200', status === 200, status);
    check('site stored at version 1', outcomeOf(body, SITE_ID)?.outcome === 'synchronized');
    check(
      'observation stored despite arriving before its site',
      outcomeOf(body, OBS_ID)?.outcome === 'synchronized',
      outcomeOf(body, OBS_ID)
    );

    const rows = await pool.query<{ name: string; notes: string }>(
      `SELECT s.name, o.notes FROM sites s JOIN observations o ON o.site_id = s.id`
    );
    check('both rows are in the database', rows.rows.length === 1, rows.rows);
    check(
      'free text is stored unmodified, in the original language',
      rows.rows[0]?.notes === 'Dos monitores en emergencias.',
      rows.rows[0]?.notes
    );

    const children = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM attribute_confidence WHERE observation_id = $1`,
      [OBS_ID]
    );
    check('child confidence rows were written', children.rows[0]?.count === '2');
  }

  console.log('\n2. Replaying the identical batch');
  {
    const { body } = await post([
      {
        entityType: 'site',
        entityId: SITE_ID,
        operation: 'create',
        localVersion: 1,
        baseServerVersion: null,
        updatedAt: '2026-09-01T10:00:00.000Z',
        payload: sitePayload('Hospital Santo Tomás', '2026-09-01T10:00:00.000Z'),
      },
    ]);

    const result = outcomeOf(body, SITE_ID);
    check('reported as replayed', result?.outcome === 'synchronized' && result.replayed === true, result);
    check(
      'server version did not advance',
      result?.outcome === 'synchronized' && result.serverVersion === 1,
      result
    );

    const sites = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM sites`
    );
    check('no duplicate row was created', sites.rows[0]?.count === '1');
  }

  console.log('\n3. A diverged update — client wins');
  {
    const { body } = await post([
      {
        entityType: 'site',
        entityId: SITE_ID,
        operation: 'update',
        localVersion: 2,
        // Claims to have last seen version 9; the server holds 1.
        baseServerVersion: 9,
        updatedAt: '2026-09-05T10:00:00.000Z',
        payload: sitePayload('Hospital Santo Tomás — Anexo', '2026-09-05T10:00:00.000Z'),
      },
    ]);

    const result = outcomeOf(body, SITE_ID);
    check('reported as a conflict, not silently', result?.outcome === 'conflict_overwritten', result);
    check(
      'reports the version it replaced',
      result?.outcome === 'conflict_overwritten' && result.previousServerVersion === 1,
      result
    );

    const site = await pool.query<{ name: string }>(`SELECT name FROM sites WHERE id = $1`, [
      SITE_ID,
    ]);
    check('the device version won', site.rows[0]?.name === 'Hospital Santo Tomás — Anexo');

    const archived = await pool.query<{ overwritten_state: { name: string }; resolution: string }>(
      `SELECT overwritten_state, resolution FROM sync_conflicts WHERE entity_id = $1`,
      [SITE_ID]
    );
    check('the replaced state was archived', archived.rows.length === 1, archived.rows);
    check(
      'the archive holds the previous value',
      archived.rows[0]?.overwritten_state?.name === 'Hospital Santo Tomás',
      archived.rows[0]?.overwritten_state
    );
    check('the archive records the policy', archived.rows[0]?.resolution === 'client_wins');
  }

  console.log('\n4. Children are replaced, not accumulated');
  {
    await post([
      {
        entityType: 'observation',
        entityId: OBS_ID,
        operation: 'update',
        localVersion: 2,
        baseServerVersion: 1,
        updatedAt: '2026-09-06T10:00:00.000Z',
        payload: {
          ...observationPayload(SITE_ID, 'Ahora tres monitores.'),
          attributeConfidence: [
            { attributeName: 'brand', confidenceLevel: 'low', attributeStatus: 'estimated', source: 'voice' },
          ],
        },
      },
    ]);

    const children = await pool.query<{ count: string; level: string }>(
      `SELECT count(*)::text AS count, min(confidence_level) AS level
         FROM attribute_confidence WHERE observation_id = $1`,
      [OBS_ID]
    );
    check('old child rows were removed', children.rows[0]?.count === '1', children.rows[0]);
    check('the new child row is the one stored', children.rows[0]?.level === 'low');

    const author = await pool.query<{ created_by: string }>(
      `SELECT created_by FROM observations WHERE id = $1`,
      [OBS_ID]
    );
    check('authorship survived the update', author.rows[0]?.created_by === USER_ID);
  }

  console.log('\n5. Records the server cannot accept');
  {
    const { body } = await post([
      {
        entityType: 'observation',
        entityId: '88888888-8888-4888-8888-888888888881',
        operation: 'create',
        localVersion: 1,
        baseServerVersion: null,
        updatedAt: '2026-09-01T10:00:00.000Z',
        payload: observationPayload(GHOST_SITE_ID, 'Sitio aún no sincronizado.'),
      },
      {
        entityType: 'site',
        entityId: '88888888-8888-4888-8888-888888888882',
        operation: 'create',
        localVersion: 1,
        baseServerVersion: null,
        updatedAt: '2026-09-01T10:00:00.000Z',
        payload: { ...sitePayload('Fuera de rango', '2026-09-01T10:00:00.000Z'), latitude: 999 },
      },
      {
        entityType: 'site',
        entityId: '88888888-8888-4888-8888-888888888883',
        operation: 'delete',
        localVersion: 1,
        baseServerVersion: 1,
        updatedAt: '2026-09-01T10:00:00.000Z',
        payload: sitePayload('Da igual', '2026-09-01T10:00:00.000Z'),
      },
      {
        entityType: 'site',
        entityId: '88888888-8888-4888-8888-888888888884',
        operation: 'create',
        localVersion: 1,
        baseServerVersion: null,
        updatedAt: '2026-09-01T10:00:00.000Z',
        payload: sitePayload('Hospital Válido', '2026-09-01T10:00:00.000Z'),
      },
    ]);

    const missing = outcomeOf(body, '88888888-8888-4888-8888-888888888881');
    check(
      'an unknown site reference is a retryable missing_reference',
      missing?.outcome === 'rejected' && missing.code === 'missing_reference',
      missing
    );

    const outOfRange = outcomeOf(body, '88888888-8888-4888-8888-888888888882');
    check(
      'an out-of-range coordinate is rejected',
      outOfRange?.outcome === 'rejected' && outOfRange.code === 'invalid_payload',
      outOfRange
    );

    const deleted = outcomeOf(body, '88888888-8888-4888-8888-888888888883');
    check(
      'delete is refused while the soft-delete strategy is undecided',
      deleted?.outcome === 'rejected' && deleted.code === 'unsupported_operation',
      deleted
    );

    const good = outcomeOf(body, '88888888-8888-4888-8888-888888888884');
    check('a valid record in the same batch still succeeded', good?.outcome === 'synchronized', good);

    check('every change got a result', body.results.length === 4, body.results.length);
    check(
      'no rejection reason echoes payload contents',
      !JSON.stringify(body).includes('Fuera de rango')
    );
  }

  console.log('\n6. A second device is not mistaken for a replay');
  {
    const secondDeviceAuth: Authenticator = {
      async authenticate() {
        return { authenticated: true, principal: { userId: USER_ID, deviceId: OTHER_DEVICE } };
      },
    };
    const otherHandle = createSyncEndpoint({
      store: createPostgresSyncStore({ pool }),
      authenticator: secondDeviceAuth,
      now: () => new Date(),
    });

    const response = await otherHandle({
      method: 'POST',
      path: SYNC_ENDPOINT_PATH,
      headers: {},
      body: JSON.stringify({
        deviceId: OTHER_DEVICE,
        clientTime: new Date().toISOString(),
        changes: [
          {
            entityType: 'site',
            entityId: SITE_ID,
            operation: 'update',
            // Same localVersion the first device last used.
            localVersion: 2,
            baseServerVersion: 2,
            updatedAt: '2026-09-07T10:00:00.000Z',
            payload: sitePayload('Nombre del segundo dispositivo', '2026-09-07T10:00:00.000Z'),
          },
        ],
      }),
    });

    const body = JSON.parse(response.body) as SyncResponse;
    const result = outcomeOf(body, SITE_ID);
    check(
      "the second device's change was applied, not skipped",
      result?.outcome === 'synchronized' && result.replayed === false,
      result
    );

    const site = await pool.query<{ name: string }>(`SELECT name FROM sites WHERE id = $1`, [
      SITE_ID,
    ]);
    check(
      'its value is what the server now holds',
      site.rows[0]?.name === 'Nombre del segundo dispositivo',
      site.rows[0]
    );
  }

  console.log('\n7. Historical data was never deleted');
  {
    const observations = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM observations`
    );
    check('the observation is still present', observations.rows[0]?.count === '1');

    const conflicts = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM sync_conflicts`
    );
    check('overwritten states are retained', Number(conflicts.rows[0]?.count) >= 1);
  }

  console.log(
    failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main().catch((error: unknown) => {
  console.error('Integration check crashed:', error);
  process.exit(1);
});
