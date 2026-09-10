/**
 * Queue-shaping helpers.
 */
import {
  changeKey,
  chunk,
  toSyncChange,
  type PendingChange,
} from '../../../features/synchronization/domain/pending-change';

const CHANGE: PendingChange = {
  entityType: 'observation',
  entityId: 'obs-1',
  operation: 'create',
  localVersion: 2,
  baseServerVersion: 1,
  updatedAt: '2026-09-01T10:00:00.000Z',
  payload: {
    siteId: 'site-1',
    equipmentId: null,
    conversationId: null,
    visitDate: '2026-09-01',
    quantity: 1,
    brand: 'Philips',
    model: null,
    modality: null,
    estimatedYearsOfUse: null,
    estimatedInstallationYear: null,
    operationalStatus: null,
    captureSource: 'text',
    notes: 'Notas en español',
    overallConfidence: 'high',
    createdBy: 'user-1',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    attributeConfidence: [],
    sources: [],
  },
};

describe('chunk', () => {
  it('splits into request-sized batches', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns one batch when everything fits', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });

  it('returns no batches for an empty queue', () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it('refuses a size below one rather than looping forever', () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe('toSyncChange', () => {
  it('carries every field through without dropping or inventing one', () => {
    // A field lost here is a field the server never stores.
    expect(toSyncChange(CHANGE)).toEqual({
      entityType: 'observation',
      entityId: 'obs-1',
      operation: 'create',
      localVersion: 2,
      baseServerVersion: 1,
      updatedAt: '2026-09-01T10:00:00.000Z',
      payload: CHANGE.payload,
    });
  });

  it('preserves free text exactly', () => {
    // Notes are stored in the user's own language (docs/tech-stack.md §7.2).
    const wire = toSyncChange(CHANGE);
    expect((wire.payload as { notes: string }).notes).toBe('Notas en español');
  });
});

describe('changeKey', () => {
  it('distinguishes the same id under different entity types', () => {
    expect(changeKey('site', 'x')).not.toBe(changeKey('equipment', 'x'));
  });
});
