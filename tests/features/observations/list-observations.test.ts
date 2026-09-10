import { loadObservationHistory } from '../../../features/observations/application/list-observations';
import type { SiteRepository } from '../../../features/sites/application/ports';
import type { ObservationRepository } from '../../../features/observations/application/ports';
import type { ObservationRecord } from '../../../features/observations/domain/observation-record';

const SITE = { id: 'site-1', name: 'Hospital DemoCare Pacific', city: 'Panama City', country: 'Panama' };

function record(): ObservationRecord {
  return {
    id: 'obs-1',
    equipmentId: null,
    siteId: SITE.id,
    visitDate: '2026-08-18',
    quantity: 1,
    brand: 'NovaMed',
    model: null,
    modality: 'MR',
    estimatedYearsOfUse: null,
    estimatedInstallationYear: null,
    operationalStatus: null,
    captureSource: 'voice',
    notes: null,
    overallConfidence: 'high',
    createdBy: 'user-1',
    createdByName: 'Field User 01',
    createdAt: '2026-08-18T12:00:00.000Z',
    updatedAt: '2026-08-18T12:00:00.000Z',
    syncStatus: 'pending',
  };
}

function sites(site: typeof SITE | null): SiteRepository {
  return {
    listSites: async () => (site ? [site] : []),
    getSite: async () => site,
  };
}

function observations(rows: ObservationRecord[]): ObservationRepository {
  return {
    save: async () => {
      throw new Error('not used by this test');
    },
    listBySite: async () => rows,
  };
}

describe('loadObservationHistory', () => {
  it('loads the site and its observations together', async () => {
    const outcome = await loadObservationHistory(SITE.id, {
      sites: sites(SITE),
      observations: observations([record()]),
    });

    expect(outcome).toEqual({
      status: 'loaded',
      data: { site: SITE, observations: [record()] },
    });
  });

  it('reports site_not_found without reading observations, for a site the device does not have', async () => {
    let observationsRead = false;
    const outcome = await loadObservationHistory(SITE.id, {
      sites: sites(null),
      observations: {
        save: async () => {
          throw new Error('unused');
        },
        listBySite: async () => {
          observationsRead = true;
          return [];
        },
      },
    });

    expect(outcome).toEqual({ status: 'site_not_found' });
    expect(observationsRead).toBe(false);
  });

  it('reports failure as a value, not a throw, when a read errors', async () => {
    const outcome = await loadObservationHistory(SITE.id, {
      sites: sites(SITE),
      observations: {
        save: async () => {
          throw new Error('unused');
        },
        listBySite: async () => {
          throw new Error('database is locked');
        },
      },
    });

    expect(outcome).toEqual({ status: 'failed', reason: 'database is locked' });
  });
});
