import {
  DUMMY_SITES,
  seedDummyInstalledBase,
} from '../../../features/catalog/application/seed-dummy-installed-base';
import type { CatalogRepository, SiteDraft } from '../../../features/catalog/application/ports';
import type { ObservationRepository } from '../../../features/observations/application/ports';
import type { NewObservation } from '../../../features/observations/domain/observation';

function fakeCatalog(options: { rejectSiteNames?: string[] } = {}) {
  const createdSites: SiteDraft[] = [];
  const catalog: CatalogRepository = {
    async createLocalUser() {
      throw new Error('not used by this seed step');
    },
    async createSite(draft) {
      if (options.rejectSiteNames?.includes(draft.name)) {
        throw new Error('Ya existe un sitio con ese nombre, ciudad y país.');
      }
      createdSites.push(draft);
      return `site-${createdSites.length}`;
    },
    async listEquipment() {
      return [];
    },
  };
  return { catalog, createdSites };
}

function fakeObservations() {
  const saved: NewObservation[] = [];
  const repository: ObservationRepository = {
    async save(observation, syncStatus) {
      saved.push(observation);
      return { id: observation.id, syncStatus, createdAt: observation.createdAt };
    },
  };
  return { repository, saved };
}

const now = () => new Date('2026-09-10T00:00:00.000Z');
let counter = 0;
const newId = () => `id-${++counter}`;

beforeEach(() => {
  counter = 0;
});

function distanceDegrees(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  return Math.hypot(a.latitude - b.latitude, a.longitude - b.longitude);
}

describe('seedDummyInstalledBase', () => {
  it('creates one site per dummy entry, each within its city radius', async () => {
    const { catalog, createdSites } = fakeCatalog();
    const { repository } = fakeObservations();

    await seedDummyInstalledBase({
      catalog,
      observations: repository,
      userId: 'user-1',
      now,
      newId,
      random: () => 0.5,
    });

    expect(createdSites).toHaveLength(DUMMY_SITES.length);
    for (const [index, site] of DUMMY_SITES.entries()) {
      const created = createdSites[index];
      expect(created.name).toBe(site.name);
      expect(created.city).toBe(site.city);
      expect(created.country).toBe(site.country);
      expect(created.latitude).not.toBeNull();
      expect(created.longitude).not.toBeNull();
      const distance = distanceDegrees(
        { latitude: created.latitude!, longitude: created.longitude! },
        { latitude: site.centerLatitude, longitude: site.centerLongitude }
      );
      expect(distance).toBeLessThanOrEqual(site.radiusDegrees + 1e-9);
    }
  });

  it('captures every equipment row for every site, attributed to the given user', async () => {
    const { catalog } = fakeCatalog();
    const { repository, saved } = fakeObservations();

    await seedDummyInstalledBase({
      catalog,
      observations: repository,
      userId: 'user-1',
      now,
      newId,
      random: () => 0.5,
    });

    const expectedCount = DUMMY_SITES.reduce((sum, site) => sum + site.equipment.length, 0);
    expect(saved).toHaveLength(expectedCount);
    expect(saved.every((observation) => observation.createdBy === 'user-1')).toBe(true);

    const brands = saved.map((observation) => observation.brand);
    expect(brands).toEqual(
      expect.arrayContaining(DUMMY_SITES.flatMap((site) => site.equipment.map((row) => row.brand)))
    );
  });

  it('skips a site already seeded, without touching its equipment', async () => {
    const alreadySeededName = DUMMY_SITES[0].name;
    const { catalog, createdSites } = fakeCatalog({ rejectSiteNames: [alreadySeededName] });
    const { repository, saved } = fakeObservations();

    await seedDummyInstalledBase({
      catalog,
      observations: repository,
      userId: 'user-1',
      now,
      newId,
      random: () => 0.5,
    });

    // Only the second site was actually created…
    expect(createdSites).toHaveLength(DUMMY_SITES.length - 1);
    expect(createdSites.map((s) => s.name)).not.toContain(alreadySeededName);
    // …and only its equipment was captured — the "already seeded" site gets
    // no new observations attributed to a site id it did not create.
    expect(saved).toHaveLength(DUMMY_SITES[1].equipment.length);
  });

  it('is safe to call twice: the second run creates nothing new', async () => {
    const rejectAll = DUMMY_SITES.map((site) => site.name);
    const { catalog, createdSites } = fakeCatalog({ rejectSiteNames: rejectAll });
    const { repository, saved } = fakeObservations();

    await seedDummyInstalledBase({
      catalog,
      observations: repository,
      userId: 'user-1',
      now,
      newId,
      random: () => 0.5,
    });

    expect(createdSites).toHaveLength(0);
    expect(saved).toHaveLength(0);
  });
});
