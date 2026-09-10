// Exercise the actual repositories and migrations against SQLite on Node 24.
// This is a verification driver, not a substitute for expo-sqlite device testing.
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { migrations } = require('../database/migrations/index.ts');
const { createCatalogRepository } = require('../database/repositories/catalog-repository.ts');
const { createObservationRepository } = require('../database/repositories/observation-repository.ts');
const { createConversationRepository } = require('../database/repositories/conversation-repository.ts');
const { createSyncRepository } = require('../database/repositories/sync-repository.ts');
const { createMapRegionRepository } = require('../database/repositories/map-region-repository.ts');
const { createSiteRepository } = require('../database/repositories/site-repository.ts');
const { captureObservation } = require('../features/observations/application/capture-observation.ts');
const { saveConversation } = require('../features/conversations/application/save-conversation.ts');
const { startConversation } = require('../features/conversations/domain/conversation.ts');
const { emptyObservationDraft } = require('../features/observations/domain/observation.ts');
const { seedDummyInstalledBase, DUMMY_SITES } = require('../features/catalog/application/seed-dummy-installed-base.ts');
const { seedPredefinedRegions } = require('../features/maps/application/seed-predefined-regions.ts');
const { PREDEFINED_REGIONS } = require('../features/maps/domain/predefined-regions.ts');
const raw = new DatabaseSync(':memory:');
raw.exec('PRAGMA foreign_keys = ON');
const db = {
  runAsync: async (sql, params = []) => raw.prepare(sql).run(...params),
  getFirstAsync: async (sql, params = []) => raw.prepare(sql).get(...params) ?? null,
  getAllAsync: async (sql, params = []) => raw.prepare(sql).all(...params),
  withTransactionAsync: async task => {
    raw.exec('BEGIN'); try { await task(); raw.exec('COMMIT'); } catch (error) { raw.exec('ROLLBACK'); throw error; }
  },
  withExclusiveTransactionAsync: task => db.withTransactionAsync(() => task(db)),
};
(async () => {
  for (const migration of migrations) raw.exec(migration.up);
  const catalog = createCatalogRepository(db, randomUUID);
  const observations = createObservationRepository(db, randomUUID);
  const conversations = createConversationRepository(db, randomUUID);
  const user = await catalog.createLocalUser('Persona de prueba');
  assert.equal((await catalog.createLocalUser('No debe crear otro')).id, user.id);
  const site = { name: 'Sitio de prueba', city: '', country: '', address: '', latitude: null, longitude: null };
  const siteId = await catalog.createSite(site);
  await assert.rejects(catalog.createSite(site), /Ya existe/);
  const draft = { ...emptyObservationDraft(), siteId, brand: 'Marca de prueba', visitDate: '2026-09-09', quantity: 2, attributeConfidence: { brand: 'high' } };
  const now = () => new Date('2026-09-09T12:00:00Z');
  assert.equal((await captureObservation(draft, user.id, { repository: observations, now, newId: randomUUID })).status, 'saved');
  const equipment = await catalog.listEquipment(siteId);
  assert.equal(equipment.length, 1);
  assert.equal((await captureObservation({ ...draft, equipmentId: equipment[0].id }, user.id, { repository: observations, now, newId: randomUUID })).status, 'saved');
  assert.equal((await catalog.listEquipment(siteId)).length, 1);
  assert.equal((await captureObservation(draft, user.id, { repository: observations, now, newId: randomUUID })).status, 'failed');
  const otherSite = await catalog.createSite({ ...site, name: 'Otro sitio' });
  assert.equal((await captureObservation({ ...draft, siteId: otherSite, equipmentId: equipment[0].id }, user.id, { repository: observations, now, newId: randomUUID })).status, 'failed');
  // Failure after equipment insertion must roll it and its queued sync record back.
  const counts = () => ['equipment', 'observations', 'sync_records'].map(table => raw.prepare(`SELECT count(*) AS n FROM ${table}`).get().n);
  const before = counts();
  assert.equal((await captureObservation({ ...draft, brand: 'Marca diferente' }, randomUUID(), { repository: observations, now, newId: randomUUID })).status, 'failed');
  assert.deepEqual(counts(), before);
  const state = startConversation(randomUUID(), user.id, now().toISOString());
  state.turns.push({ role: 'user', text: 'dos equipos', source: 'voice', reference: 'file:///local/clip.m4a', at: now().toISOString() });
  await conversations.save(state);
  assert.deepEqual(await conversations.latest(user.id), state);
  await saveConversation(state, { ...draft, equipmentId: equipment[0].id }, { repository: conversations, now, newId: randomUUID });
  await saveConversation(state, draft, { repository: conversations, now, newId: randomUUID });
  assert.equal(raw.prepare('SELECT count(*) AS n FROM observations WHERE conversation_id = ?').get(state.id).n, 1);
  assert.equal((await conversations.latest(user.id)).status, 'saved');
  assert.equal(raw.prepare("SELECT count(*) AS n FROM observation_sources WHERE source = 'voice'").get().n, 1);
  const queue = createSyncRepository(db);
  const claimed = await queue.claimPendingChanges(200, now().toISOString());
  const types = claimed.changes.map(change => change.entityType);
  assert.ok(types.lastIndexOf('site') < types.indexOf('equipment'));
  assert.ok(types.lastIndexOf('equipment') < types.indexOf('observation'));
  assert.ok(types.indexOf('conversation') < types.indexOf('observation'));
  assert.deepEqual(raw.prepare('PRAGMA foreign_key_check').all(), []);

  // Demo data seed (real Dashboard/Capture/Map task): both seed steps against
  // real SQLite, not fakes, so CHECK constraints and foreign keys are what
  // actually validate the shape.
  const mapRegions = createMapRegionRepository(db);
  const seedNow = () => new Date('2026-09-10T00:00:00Z');
  await seedDummyInstalledBase({ catalog, observations, userId: user.id, now: seedNow, newId: randomUUID });
  await seedPredefinedRegions(mapRegions);

  const siteCount = () => raw.prepare('SELECT count(*) AS n FROM sites').get().n;
  const equipmentCount = () => raw.prepare('SELECT count(*) AS n FROM equipment').get().n;
  const regionCount = () => raw.prepare('SELECT count(*) AS n FROM map_regions').get().n;

  const expectedEquipment = DUMMY_SITES.reduce((sum, site) => sum + site.equipment.length, 0);
  // +2 sites ('Sitio de prueba', 'Otro sitio') and +1 equipment row from the
  // manual-capture checks above — everything else in this block is new.
  assert.equal(siteCount(), DUMMY_SITES.length + 2);
  assert.equal(equipmentCount(), expectedEquipment + 1);
  assert.equal(regionCount(), PREDEFINED_REGIONS.length);

  for (const region of PREDEFINED_REGIONS) {
    const row = raw.prepare('SELECT download_status, download_progress FROM map_regions WHERE id = ?').get(region.id);
    assert.ok(row, `missing seeded region row: ${region.id}`);
    assert.equal(row.download_status, 'not_downloaded');
    assert.equal(row.download_progress, 0);
  }
  for (const site of DUMMY_SITES) {
    const row = raw.prepare('SELECT latitude, longitude FROM sites WHERE name = ?').get(site.name);
    assert.ok(row, `missing seeded site: ${site.name}`);
    assert.ok(Number.isFinite(row.latitude) && Number.isFinite(row.longitude));
  }

  // Re-running both seed steps (as happens on every app launch) must not
  // duplicate a single row.
  await seedDummyInstalledBase({ catalog, observations, userId: user.id, now: seedNow, newId: randomUUID });
  await seedPredefinedRegions(mapRegions);
  assert.equal(siteCount(), DUMMY_SITES.length + 2);
  assert.equal(equipmentCount(), expectedEquipment + 1);
  assert.equal(regionCount(), PREDEFINED_REGIONS.length);
  assert.deepEqual(raw.prepare('PRAGMA foreign_key_check').all(), []);

  // Observation-history screen: SiteRepository.getSite and
  // ObservationRepository.listBySite, against real SQLite.
  const siteRepository = createSiteRepository(db);
  const pacific = DUMMY_SITES.find(site => site.name === 'Hospital DemoCare Pacific');
  const pacificRow = raw.prepare('SELECT id FROM sites WHERE name = ?').get(pacific.name);
  const pacificSite = await siteRepository.getSite(pacificRow.id);
  assert.equal(pacificSite.name, pacific.name);
  assert.equal(pacificSite.city, pacific.city);
  assert.equal(pacificSite.country, pacific.country);
  assert.equal(await siteRepository.getSite(randomUUID()), null);

  const pacificObservations = await observations.listBySite(pacificRow.id);
  assert.equal(pacificObservations.length, pacific.equipment.length);
  // Newest visit_date first (both rows share a date in the dummy dataset, so
  // this also exercises that the query and mapping do not throw on ties).
  assert.ok(pacificObservations.every(o => o.siteId === pacificRow.id));
  assert.ok(pacificObservations.every(o => o.createdBy === user.id));
  assert.ok(pacificObservations.every(o => o.createdByName === user.name));
  assert.ok(pacificObservations.every(o => o.syncStatus === 'pending'));
  assert.deepEqual(new Set(pacificObservations.map(o => o.brand)),
    new Set(pacific.equipment.map(e => e.brand)));
  // notes is read (unlike the dashboard's aggregate projection, which omits it).
  assert.ok(pacificObservations.every(o => typeof o.notes === 'string' && o.notes.length > 0));

  assert.deepEqual(await observations.listBySite(randomUUID()), []);

  console.log('SQLite integration passed: fresh setup, duplicates, equipment history, atomic rollback, conversation recovery, idempotent finalization, sources, queue dependency order, foreign keys, demo data seeding (sites, equipment, map regions — idempotent on re-run), and the observation-history reads (getSite, listBySite).');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => raw.close());
