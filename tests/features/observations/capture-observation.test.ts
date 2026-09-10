import {
  captureObservation,
  INITIAL_SYNC_STATUS,
  toIsoDate,
} from '../../../features/observations/application/capture-observation';
import type {
  ObservationRepository,
  SavedObservation,
} from '../../../features/observations/application/ports';
import {
  emptyObservationDraft,
  type NewObservation,
  type ObservationDraft,
} from '../../../features/observations/domain/observation';
import type { SyncStatus } from '../../../types/domain';

const NOW = new Date('2026-09-09T14:48:00.000Z');

interface RecordingRepository extends ObservationRepository {
  saved: Array<{ observation: NewObservation; syncStatus: SyncStatus }>;
}

function recordingRepository(): RecordingRepository {
  const saved: RecordingRepository['saved'] = [];
  return {
    saved,
    async save(observation, syncStatus): Promise<SavedObservation> {
      saved.push({ observation, syncStatus });
      return {
        id: observation.id,
        syncStatus,
        createdAt: observation.createdAt,
      };
    },
    async listBySite() {
      throw new Error('not used by this test');
    },
  };
}

function failingRepository(message: string): ObservationRepository {
  return {
    async save() {
      throw new Error(message);
    },
    async listBySite() {
      throw new Error('not used by this test');
    },
  };
}

function deps(repository: ObservationRepository) {
  let counter = 0;
  return {
    repository,
    now: () => NOW,
    newId: () => `id-${++counter}`,
  };
}

function draft(overrides: Partial<ObservationDraft> = {}): ObservationDraft {
  return {
    ...emptyObservationDraft(),
    siteId: 'site-1',
    visitDate: '2026-09-08',
    brand: 'Philips',
    ...overrides,
  };
}

describe('captureObservation', () => {
  it('persists a valid draft and reports it saved', async () => {
    const repository = recordingRepository();
    const outcome = await captureObservation(draft(), 'user-1', deps(repository));

    expect(outcome.status).toBe('saved');
    expect(repository.saved).toHaveLength(1);
  });

  it('saves new observations as pending, not local_only', async () => {
    const repository = recordingRepository();
    await captureObservation(draft(), 'user-1', deps(repository));

    expect(repository.saved[0].syncStatus).toBe('pending');
    expect(INITIAL_SYNC_STATUS).toBe('pending');
  });

  it('reports the persisted sync state back to the caller', async () => {
    const outcome = await captureObservation(
      draft(),
      'user-1',
      deps(recordingRepository())
    );

    expect(outcome.status === 'saved' && outcome.saved.syncStatus).toBe(
      'pending'
    );
  });

  it('does not touch the repository when validation fails', async () => {
    const repository = recordingRepository();
    const outcome = await captureObservation(
      draft({ siteId: null }),
      'user-1',
      deps(repository)
    );

    expect(outcome.status).toBe('validation_failed');
    expect(repository.saved).toHaveLength(0);
  });

  it('returns the validation issues so the form can show them', async () => {
    const outcome = await captureObservation(
      draft({ siteId: null, brand: null }),
      'user-1',
      deps(recordingRepository())
    );

    expect(outcome.status).toBe('validation_failed');
    if (outcome.status !== 'validation_failed') return;
    expect(outcome.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'site_required',
        'identifying_attribute_required',
      ])
    );
  });

  it('reports a persistence failure instead of throwing', async () => {
    const outcome = await captureObservation(
      draft(),
      'user-1',
      deps(failingRepository('disk full'))
    );

    expect(outcome.status).toBe('failed');
    expect(outcome.status === 'failed' && outcome.reason).toContain('disk full');
  });

  describe('the assembled record', () => {
    async function capturedObservation(
      overrides: Partial<ObservationDraft> = {}
    ): Promise<NewObservation> {
      const repository = recordingRepository();
      await captureObservation(draft(overrides), 'user-1', deps(repository));
      return repository.saved[0].observation;
    }

    it('marks the capture source as text', async () => {
      const observation = await capturedObservation();
      expect(observation.captureSource).toBe('text');
      expect(observation.sources).toEqual([
        { source: 'text', reference: null },
      ]);
    });

    it('records manually typed attributes as reported, not confirmed', async () => {
      const observation = await capturedObservation({
        attributeConfidence: { brand: 'high' },
      });

      expect(observation.attributeConfidence).toEqual([
        {
          attributeName: 'brand',
          confidenceLevel: 'high',
          attributeStatus: 'reported',
          source: 'text',
        },
      ]);
    });

    it('writes no confidence rows when the user selected none', async () => {
      const observation = await capturedObservation();
      expect(observation.attributeConfidence).toEqual([]);
      expect(observation.overallConfidence).toBeNull();
    });

    it('derives the overall confidence from the per-attribute values', async () => {
      const observation = await capturedObservation({
        brand: 'Philips',
        modality: 'Monitor',
        attributeConfidence: { brand: 'high', modality: 'low' },
      });

      expect(observation.overallConfidence).toBe('low');
    });

    it('leaves equipment_id and conversation_id unset for manual capture', async () => {
      const observation = await capturedObservation();
      expect(observation.equipmentId).toBeNull();
      expect(observation.conversationId).toBeNull();
    });

    it('attributes the observation to the given user', async () => {
      const observation = await capturedObservation();
      expect(observation.createdBy).toBe('user-1');
    });

    it('stamps created_at and updated_at as the same UTC instant', async () => {
      const observation = await capturedObservation();
      expect(observation.createdAt).toBe('2026-09-09T14:48:00.000Z');
      expect(observation.updatedAt).toBe(observation.createdAt);
    });

    it('trims free text and stores blank fields as null', async () => {
      const observation = await capturedObservation({
        brand: '  Philips  ',
        notes: '   ',
      });

      expect(observation.brand).toBe('Philips');
      expect(observation.notes).toBeNull();
    });

    it('keeps notes in the language the user typed', async () => {
      const observation = await capturedObservation({
        notes: 'Cinco monitores en la UCI.',
      });

      expect(observation.notes).toBe('Cinco monitores en la UCI.');
    });
  });
});

describe('toIsoDate', () => {
  it('formats a date as YYYY-MM-DD in UTC', () => {
    expect(toIsoDate(new Date('2026-09-09T23:30:00.000Z'))).toBe('2026-09-09');
  });
});
