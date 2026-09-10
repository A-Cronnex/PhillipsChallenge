/**
 * Dashboard metric rules.
 *
 * Every rule is pure and computed from locally stored observations, so all of
 * it is testable without a device — unlike the SQL that feeds it
 * (`expo-sqlite` has no Node implementation).
 */
import {
  AGE_BUCKETS,
  AGING_EQUIPMENT_YEARS,
  RECENTLY_UPDATED_LIMIT,
  STALE_SITE_DAYS,
  UNKNOWN_AGE_BUCKET,
  ageBucketFor,
  computeDashboardMetrics,
  daysBetween,
  estimatedAge,
  missingFields,
  unitsOf,
  type ObservationFact,
} from '../../../features/dashboard/domain/metrics';

const TODAY = '2026-09-09';

function fact(overrides: Partial<ObservationFact> = {}): ObservationFact {
  return {
    observationId: 'obs-1',
    siteId: 'site-1',
    siteName: 'Hospital Alfa',
    country: 'Panamá',
    city: 'Ciudad de Panamá',
    visitDate: TODAY,
    quantity: 1,
    brand: 'Philips',
    model: 'IntelliVue MX450',
    modality: 'Monitor',
    estimatedYearsOfUse: 3,
    estimatedInstallationYear: null,
    overallConfidence: 'high',
    ...overrides,
  };
}

describe('unitsOf', () => {
  it('counts an unknown quantity as one real record, not as zero', () => {
    expect(unitsOf(fact({ quantity: null }))).toBe(1);
  });

  it('counts the reported quantity when there is one', () => {
    expect(unitsOf(fact({ quantity: 5 }))).toBe(5);
  });
});

describe('estimatedAge', () => {
  it('prefers the years of use the user was asked directly', () => {
    expect(
      estimatedAge(
        fact({ estimatedYearsOfUse: 8, estimatedInstallationYear: 2000 }),
        2026
      )
    ).toBe(8);
  });

  it('derives the age from the installation year when that is all there is', () => {
    expect(
      estimatedAge(
        fact({ estimatedYearsOfUse: null, estimatedInstallationYear: 2014 }),
        2026
      )
    ).toBe(12);
  });

  it('returns null rather than assuming an unknown equipment is new', () => {
    expect(
      estimatedAge(
        fact({ estimatedYearsOfUse: null, estimatedInstallationYear: null }),
        2026
      )
    ).toBeNull();
  });

  it('never reports a negative age for a future installation year', () => {
    expect(
      estimatedAge(
        fact({ estimatedYearsOfUse: null, estimatedInstallationYear: 2030 }),
        2026
      )
    ).toBe(0);
  });
});

describe('ageBucketFor', () => {
  it('places an age in its band', () => {
    expect(ageBucketFor(0)).toBe('0-4');
    expect(ageBucketFor(4)).toBe('0-4');
    expect(ageBucketFor(5)).toBe('5-9');
    expect(ageBucketFor(14)).toBe('10-14');
    expect(ageBucketFor(40)).toBe('15+');
  });

  it('keeps an unknown age separate from a young one', () => {
    expect(ageBucketFor(null)).toBe(UNKNOWN_AGE_BUCKET);
  });
});

describe('missingFields', () => {
  it('reports nothing for a complete observation', () => {
    expect(missingFields(fact(), 2026)).toEqual([]);
  });

  it('treats blank text as missing, not as a value', () => {
    expect(missingFields(fact({ brand: '   ' }), 2026)).toContain('brand');
  });

  it('reports an observation with no way to establish an age', () => {
    expect(
      missingFields(
        fact({ estimatedYearsOfUse: null, estimatedInstallationYear: null }),
        2026
      )
    ).toContain('age');
  });
});

describe('daysBetween', () => {
  it('counts whole days between ISO dates', () => {
    expect(daysBetween('2026-09-01', '2026-09-09')).toBe(8);
    expect(daysBetween('2026-09-09', '2026-09-09')).toBe(0);
  });

  it('returns 0 for a malformed date instead of NaN reaching the screen', () => {
    expect(daysBetween('no es una fecha', '2026-09-09')).toBe(0);
  });
});

describe('computeDashboardMetrics — totals', () => {
  it('reports an empty dataset without inventing zeros as facts', () => {
    const metrics = computeDashboardMetrics([], TODAY);

    expect(metrics.totals).toEqual({
      sites: 0,
      observations: 0,
      reportedUnits: 0,
      modalities: 0,
      brands: 0,
    });
    expect(metrics.sites).toEqual([]);
    expect(metrics.byModality).toEqual([]);
  });

  it('sums reported units across observations', () => {
    const metrics = computeDashboardMetrics(
      [
        fact({ observationId: 'a', quantity: 3 }),
        fact({ observationId: 'b', quantity: null }),
      ],
      TODAY
    );

    expect(metrics.totals.observations).toBe(2);
    expect(metrics.totals.reportedUnits).toBe(4);
  });

  it('counts distinct modalities and brands, ignoring the ones not recorded', () => {
    const metrics = computeDashboardMetrics(
      [
        fact({ observationId: 'a', modality: 'MR', brand: 'Philips' }),
        fact({ observationId: 'b', modality: 'CT', brand: 'Philips' }),
        fact({ observationId: 'c', modality: null, brand: null }),
      ],
      TODAY
    );

    expect(metrics.totals.modalities).toBe(2);
    expect(metrics.totals.brands).toBe(1);
  });
});

describe('computeDashboardMetrics — breakdowns', () => {
  it('groups by modality, biggest first, with the unrecorded bucket last', () => {
    const metrics = computeDashboardMetrics(
      [
        fact({ observationId: 'a', modality: 'CT', quantity: 2 }),
        fact({ observationId: 'b', modality: null, quantity: 9 }),
        fact({ observationId: 'c', modality: 'MR', quantity: 5 }),
      ],
      TODAY
    );

    expect(metrics.byModality.map((entry) => entry.key)).toEqual([
      'MR',
      'CT',
      null,
    ]);
    expect(metrics.byModality[0]).toEqual({
      key: 'MR',
      observations: 1,
      units: 5,
    });
  });

  it('groups by country the same way', () => {
    const metrics = computeDashboardMetrics(
      [
        fact({ observationId: 'a', country: 'Panamá', quantity: 1 }),
        fact({ observationId: 'b', country: 'Brasil', quantity: 4 }),
        fact({ observationId: 'c', country: null, quantity: 2 }),
      ],
      TODAY
    );

    expect(metrics.byCountry.map((entry) => entry.key)).toEqual([
      'Brasil',
      'Panamá',
      null,
    ]);
  });

  it('reports every age bucket, including the empty ones', () => {
    const metrics = computeDashboardMetrics([fact({ estimatedYearsOfUse: 3 })], TODAY);

    expect(metrics.byAge.map((bucket) => bucket.bucket)).toEqual([
      ...AGE_BUCKETS.map((bucket) => bucket.key),
      UNKNOWN_AGE_BUCKET,
    ]);
    expect(metrics.byAge.find((b) => b.bucket === '0-4')?.units).toBe(1);
    expect(metrics.byAge.find((b) => b.bucket === '15+')?.units).toBe(0);
  });

  it('counts an observation with no overall confidence as unrated, not as low', () => {
    const metrics = computeDashboardMetrics(
      [
        fact({ observationId: 'a', overallConfidence: null }),
        fact({ observationId: 'b', overallConfidence: 'low' }),
      ],
      TODAY
    );

    expect(metrics.byConfidence).toEqual({
      high: 0,
      medium: 0,
      low: 1,
      unrated: 1,
    });
  });

  it('counts an observation once as incomplete however many fields it lacks', () => {
    const metrics = computeDashboardMetrics(
      [
        fact({ observationId: 'a', brand: null, model: null }),
        fact({ observationId: 'b' }),
      ],
      TODAY
    );

    expect(metrics.completeness.incomplete).toBe(1);
    expect(metrics.completeness.complete).toBe(1);
    expect(metrics.completeness.missingByField.brand).toBe(1);
    expect(metrics.completeness.missingByField.model).toBe(1);
    expect(metrics.completeness.missingByField.modality).toBe(0);
  });
});

describe('computeDashboardMetrics — per site', () => {
  it('rolls several observations up into one site', () => {
    const metrics = computeDashboardMetrics(
      [
        fact({
          observationId: 'a',
          visitDate: '2026-01-10',
          quantity: 2,
          modality: 'MR',
          estimatedYearsOfUse: 3,
        }),
        fact({
          observationId: 'b',
          visitDate: '2026-05-04',
          quantity: 1,
          modality: 'CT',
          estimatedYearsOfUse: 12,
        }),
      ],
      TODAY
    );

    expect(metrics.sites).toHaveLength(1);
    const site = metrics.sites[0];
    expect(site.observations).toBe(2);
    expect(site.reportedUnits).toBe(3);
    expect(site.lastVisitDate).toBe('2026-05-04');
    expect(site.modalities).toEqual(['CT', 'MR']);
    // The oldest equipment is what makes a site a refresh candidate; averaging
    // would hide a 12-year-old scanner behind a new one.
    expect(site.oldestEquipmentAge).toBe(12);
  });

  it('keeps the latest visit date regardless of the order rows arrive in', () => {
    const metrics = computeDashboardMetrics(
      [
        fact({ observationId: 'a', visitDate: '2026-05-04' }),
        fact({ observationId: 'b', visitDate: '2026-01-10' }),
      ],
      TODAY
    );

    expect(metrics.sites[0].lastVisitDate).toBe('2026-05-04');
  });

  it('separates sites', () => {
    const metrics = computeDashboardMetrics(
      [
        fact({ observationId: 'a', siteId: 'site-1', siteName: 'Hospital Alfa' }),
        fact({ observationId: 'b', siteId: 'site-2', siteName: 'Hospital Beta' }),
      ],
      TODAY
    );

    expect(metrics.totals.sites).toBe(2);
    expect(metrics.sites.map((site) => site.name)).toEqual([
      'Hospital Alfa',
      'Hospital Beta',
    ]);
  });
});

describe('computeDashboardMetrics — actionable lists', () => {
  it('lists sites whose oldest equipment reaches the aging threshold', () => {
    const metrics = computeDashboardMetrics(
      [
        fact({
          observationId: 'a',
          siteId: 'old',
          siteName: 'Hospital Viejo',
          estimatedYearsOfUse: AGING_EQUIPMENT_YEARS,
        }),
        fact({
          observationId: 'b',
          siteId: 'new',
          siteName: 'Hospital Nuevo',
          estimatedYearsOfUse: AGING_EQUIPMENT_YEARS - 1,
        }),
      ],
      TODAY
    );

    expect(metrics.agingSites.map((site) => site.siteId)).toEqual(['old']);
  });

  it('does not call a site aging because its age is unknown', () => {
    const metrics = computeDashboardMetrics(
      [
        fact({
          estimatedYearsOfUse: null,
          estimatedInstallationYear: null,
        }),
      ],
      TODAY
    );

    expect(metrics.agingSites).toEqual([]);
  });

  it('lists stale sites, oldest first', () => {
    const metrics = computeDashboardMetrics(
      [
        fact({ observationId: 'a', siteId: 'fresh', visitDate: '2026-09-01' }),
        fact({ observationId: 'b', siteId: 'stale', siteName: 'B', visitDate: '2024-01-01' }),
        fact({ observationId: 'c', siteId: 'staler', siteName: 'C', visitDate: '2023-01-01' }),
      ],
      TODAY
    );

    expect(metrics.staleSites.map((site) => site.siteId)).toEqual([
      'staler',
      'stale',
    ]);
    expect(metrics.staleSites[0].daysSinceLastVisit).toBeGreaterThanOrEqual(
      STALE_SITE_DAYS
    );
  });

  it('lists recently updated sites, newest first and capped', () => {
    const facts = Array.from({ length: RECENTLY_UPDATED_LIMIT + 2 }, (_, index) =>
      fact({
        observationId: `obs-${index}`,
        siteId: `site-${index}`,
        siteName: `Hospital ${index}`,
        visitDate: `2026-0${(index % 9) + 1}-01`,
      })
    );

    const metrics = computeDashboardMetrics(facts, TODAY);

    expect(metrics.recentlyUpdatedSites).toHaveLength(RECENTLY_UPDATED_LIMIT);
    const dates = metrics.recentlyUpdatedSites.map((site) => site.lastVisitDate);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
