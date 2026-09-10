/**
 * Server-side validation.
 *
 * The device is an untrusted producer from the server's point of view
 * (CLAUDE.md §7 applied one layer out): these tests assert that a record the
 * central schema would refuse is caught here with an explanation, and that a
 * device cannot write data in another user's name (CLAUDE.md §15).
 */
import { validateChange, type Principal } from '../../server/src/validation/validate-change';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const DEVICE_ID = '33333333-3333-4333-8333-333333333333';
const ENTITY_ID = '44444444-4444-4444-8444-444444444444';
const SITE_ID = '55555555-5555-4555-8555-555555555555';

const PRINCIPAL: Principal = { userId: USER_ID, deviceId: DEVICE_ID };

function sitePayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Hospital Santo Tomás',
    country: 'Panamá',
    city: 'Ciudad de Panamá',
    latitude: 8.98,
    longitude: -79.52,
    address: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

function observationPayload(overrides: Record<string, unknown> = {}) {
  return {
    siteId: SITE_ID,
    equipmentId: null,
    conversationId: null,
    visitDate: '2026-09-01',
    quantity: 3,
    brand: 'Philips',
    model: 'IntelliVue MX450',
    modality: 'Monitor',
    estimatedYearsOfUse: 4,
    estimatedInstallationYear: 2022,
    operationalStatus: 'operativo',
    captureSource: 'text',
    notes: 'Tres monitores en cuidados intensivos.',
    overallConfidence: 'high',
    createdBy: USER_ID,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    attributeConfidence: [
      {
        attributeName: 'brand',
        confidenceLevel: 'high',
        attributeStatus: 'reported',
        source: 'text',
      },
    ],
    sources: [{ source: 'text', reference: null }],
    ...overrides,
  };
}

function change(overrides: Record<string, unknown> = {}) {
  return {
    entityType: 'site',
    entityId: ENTITY_ID,
    operation: 'create',
    localVersion: 1,
    baseServerVersion: null,
    updatedAt: '2026-09-01T10:00:00.000Z',
    payload: sitePayload(),
    ...overrides,
  };
}

describe('validateChange — envelope', () => {
  it('accepts a well-formed site change', () => {
    const result = validateChange(change(), PRINCIPAL);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entityType).toBe('site');
      expect(result.value.entityId).toBe(ENTITY_ID);
      expect(result.value.baseServerVersion).toBeNull();
    }
  });

  it('rejects an unknown entity type', () => {
    const result = validateChange(change({ entityType: 'patient' }), PRINCIPAL);

    expect(result).toMatchObject({ ok: false, failure: { code: 'invalid_payload' } });
  });

  it('rejects a non-UUID entity id', () => {
    // Stable UUIDs are what make retries idempotent (docs/offline-sync.md §7).
    const result = validateChange(change({ entityId: 'obs-1' }), PRINCIPAL);

    expect(result).toMatchObject({ ok: false, failure: { code: 'invalid_payload' } });
  });

  it('rejects delete with a dedicated, non-retryable code', () => {
    // No soft-delete strategy is decided (docs/database.md §16), and historical
    // observations must be preserved (docs/offline-sync.md §9).
    const result = validateChange(change({ operation: 'delete' }), PRINCIPAL);

    expect(result).toMatchObject({
      ok: false,
      failure: { code: 'unsupported_operation' },
    });
  });

  it.each([0, -1, 1.5, '1', null])('rejects localVersion %p', (localVersion) => {
    const result = validateChange(change({ localVersion }), PRINCIPAL);
    expect(result.ok).toBe(false);
  });

  it('rejects a non-UTC updatedAt rather than coercing it', () => {
    // Reinterpreting a local-time string as UTC silently reorders history.
    const result = validateChange(
      change({ updatedAt: '2026-09-01T10:00:00-05:00' }),
      PRINCIPAL
    );

    expect(result.ok).toBe(false);
  });

  it('rejects a missing payload', () => {
    const result = validateChange(change({ payload: null }), PRINCIPAL);
    expect(result.ok).toBe(false);
  });
});

describe('validateChange — site payload', () => {
  it('rejects a blank name', () => {
    const result = validateChange(
      change({ payload: sitePayload({ name: '   ' }) }),
      PRINCIPAL
    );
    expect(result.ok).toBe(false);
  });

  it.each([
    ['latitude', 91],
    ['latitude', -91],
    ['longitude', 181],
    ['longitude', -181],
  ])('rejects %s out of range (%p)', (field, value) => {
    const result = validateChange(
      change({ payload: sitePayload({ [field]: value }) }),
      PRINCIPAL
    );
    expect(result.ok).toBe(false);
  });

  it('accepts null coordinates', () => {
    // A site can be captured by name before its coordinates are known.
    const result = validateChange(
      change({ payload: sitePayload({ latitude: null, longitude: null }) }),
      PRINCIPAL
    );
    expect(result.ok).toBe(true);
  });

  it('normalises an empty optional string to null', () => {
    const result = validateChange(
      change({ payload: sitePayload({ city: '  ' }) }),
      PRINCIPAL
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value.payload as { city: string | null }).city).toBeNull();
    }
  });

  it('rejects a free-text field beyond the length cap', () => {
    const result = validateChange(
      change({ payload: sitePayload({ address: 'x'.repeat(4001) }) }),
      PRINCIPAL
    );
    expect(result.ok).toBe(false);
  });
});

describe('validateChange — observation payload', () => {
  function observationChange(payloadOverrides: Record<string, unknown> = {}) {
    return change({
      entityType: 'observation',
      payload: observationPayload(payloadOverrides),
    });
  }

  it('accepts a well-formed observation', () => {
    const result = validateChange(observationChange(), PRINCIPAL);
    expect(result.ok).toBe(true);
  });

  it('rejects an observation attributed to another user', () => {
    // Least privilege (CLAUDE.md §15): an authenticated device must not be able
    // to write records in someone else's name.
    const result = validateChange(
      observationChange({ createdBy: OTHER_USER_ID }),
      PRINCIPAL
    );

    expect(result).toMatchObject({
      ok: false,
      failure: { code: 'not_owned_by_principal' },
    });
  });

  it('rejects quantity of zero', () => {
    const result = validateChange(observationChange({ quantity: 0 }), PRINCIPAL);
    expect(result.ok).toBe(false);
  });

  it('rejects a visitDate that is not YYYY-MM-DD', () => {
    const result = validateChange(
      observationChange({ visitDate: '2026-09-01T00:00:00.000Z' }),
      PRINCIPAL
    );
    expect(result.ok).toBe(false);
  });

  it('rejects an out-of-range installation year', () => {
    const result = validateChange(
      observationChange({ estimatedInstallationYear: 1899 }),
      PRINCIPAL
    );
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown confidence level', () => {
    const result = validateChange(
      observationChange({ overallConfidence: 'very-high' }),
      PRINCIPAL
    );
    expect(result.ok).toBe(false);
  });

  it('leaves operationalStatus unconstrained', () => {
    // No document enumerates its values; constraining it would mean inventing
    // a vocabulary (CLAUDE.md §8).
    const result = validateChange(
      observationChange({ operationalStatus: 'fuera de servicio desde marzo' }),
      PRINCIPAL
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a duplicated attribute confidence entry', () => {
    // The central schema keys these by (observation_id, attribute_name); a
    // duplicate would let write order decide the winner.
    const result = validateChange(
      observationChange({
        attributeConfidence: [
          { attributeName: 'brand', confidenceLevel: 'high', attributeStatus: 'reported', source: 'text' },
          { attributeName: 'brand', confidenceLevel: 'low', attributeStatus: 'estimated', source: 'text' },
        ],
      }),
      PRINCIPAL
    );

    expect(result.ok).toBe(false);
  });

  it('rejects a bad attribute status inside a child row', () => {
    const result = validateChange(
      observationChange({
        attributeConfidence: [
          { attributeName: 'brand', confidenceLevel: 'high', attributeStatus: 'guessed', source: 'text' },
        ],
      }),
      PRINCIPAL
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.reason).toContain('attributeConfidence[0]');
  });

  it('requires the child collections to be present', () => {
    const result = validateChange(
      observationChange({ attributeConfidence: undefined }),
      PRINCIPAL
    );
    expect(result.ok).toBe(false);
  });

  it('accepts empty child collections', () => {
    const result = validateChange(
      observationChange({ attributeConfidence: [], sources: [] }),
      PRINCIPAL
    );
    expect(result.ok).toBe(true);
  });

  it('preserves notes exactly, without translating or truncating', () => {
    // Free text is stored in the user's own language (docs/tech-stack.md §7.2).
    const notes = 'Dos equipos con fallas intermitentes en el área de imágenes.';
    const result = validateChange(observationChange({ notes }), PRINCIPAL);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value.payload as { notes: string }).notes).toBe(notes);
    }
  });
});

describe('validateChange — conversation payload', () => {
  it('rejects a conversation belonging to another user', () => {
    const result = validateChange(
      change({
        entityType: 'conversation',
        payload: {
          userId: OTHER_USER_ID,
          startedAt: '2026-09-01T10:00:00.000Z',
          endedAt: null,
          status: 'saved',
          transcriptReference: null,
          summary: null,
          createdAt: '2026-09-01T10:00:00.000Z',
          updatedAt: '2026-09-01T10:00:00.000Z',
        },
      }),
      PRINCIPAL
    );

    expect(result).toMatchObject({
      ok: false,
      failure: { code: 'not_owned_by_principal' },
    });
  });

  it('rejects a status outside the conversation state machine', () => {
    const result = validateChange(
      change({
        entityType: 'conversation',
        payload: {
          userId: USER_ID,
          startedAt: '2026-09-01T10:00:00.000Z',
          endedAt: null,
          status: 'thinking',
          transcriptReference: null,
          summary: null,
          createdAt: '2026-09-01T10:00:00.000Z',
          updatedAt: '2026-09-01T10:00:00.000Z',
        },
      }),
      PRINCIPAL
    );

    expect(result.ok).toBe(false);
  });
});
