import {
  matchesObservationQuery,
  sortObservations,
  type ObservationRecord,
} from '../../../features/observations/domain/observation-record';

function record(overrides: Partial<ObservationRecord> = {}): ObservationRecord {
  return {
    id: 'obs-1',
    equipmentId: 'eq-1',
    siteId: 'site-1',
    visitDate: '2026-08-18',
    quantity: 2,
    brand: 'NovaMed',
    model: 'NM-MR 700',
    modality: 'MR',
    estimatedYearsOfUse: 7,
    estimatedInstallationYear: 2019,
    operationalStatus: null,
    captureSource: 'voice',
    notes: 'Two MR systems observed in imaging area.',
    overallConfidence: 'high',
    createdBy: 'user-1',
    createdByName: 'Field User 01',
    createdAt: '2026-08-18T12:00:00.000Z',
    updatedAt: '2026-08-18T12:00:00.000Z',
    syncStatus: 'pending',
    ...overrides,
  };
}

describe('matchesObservationQuery', () => {
  it('matches on brand, model, modality and notes, case-insensitively', () => {
    const observation = record();
    expect(matchesObservationQuery(observation, 'novamed')).toBe(true);
    expect(matchesObservationQuery(observation, 'NM-MR')).toBe(true);
    expect(matchesObservationQuery(observation, 'mr')).toBe(true);
    expect(matchesObservationQuery(observation, 'imaging area')).toBe(true);
  });

  it('does not match on fields outside the searchable set', () => {
    const observation = record({ id: 'unique-id-fragment' });
    expect(matchesObservationQuery(observation, 'unique-id-fragment')).toBe(false);
  });

  it('an empty or blank query matches everything', () => {
    const observation = record();
    expect(matchesObservationQuery(observation, '')).toBe(true);
    expect(matchesObservationQuery(observation, '   ')).toBe(true);
  });

  it('does not throw on an observation with every searchable field null', () => {
    const observation = record({ brand: null, model: null, modality: null, notes: null });
    expect(matchesObservationQuery(observation, 'anything')).toBe(false);
    expect(matchesObservationQuery(observation, '')).toBe(true);
  });
});

describe('sortObservations', () => {
  const older = record({ id: 'a', visitDate: '2026-08-01', brand: 'Zenith MedTech' });
  const newer = record({ id: 'b', visitDate: '2026-08-20', brand: 'Aurelia Health' });
  const noBrand = record({ id: 'c', visitDate: '2026-08-10', brand: null });

  it('orders by visit date, most recent first', () => {
    const sorted = sortObservations([older, newer, noBrand], 'visit_date_desc');
    expect(sorted.map((o) => o.id)).toEqual(['b', 'c', 'a']);
  });

  it('orders by visit date, oldest first', () => {
    const sorted = sortObservations([older, newer, noBrand], 'visit_date_asc');
    expect(sorted.map((o) => o.id)).toEqual(['a', 'c', 'b']);
  });

  it('orders by brand alphabetically, with unbranded observations last', () => {
    const sorted = sortObservations([older, newer, noBrand], 'brand_asc');
    expect(sorted.map((o) => o.id)).toEqual(['b', 'a', 'c']);
  });

  it('does not mutate the input array', () => {
    const input = [older, newer];
    const copy = [...input];
    sortObservations(input, 'visit_date_asc');
    expect(input).toEqual(copy);
  });
});
