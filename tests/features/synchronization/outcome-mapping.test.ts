/**
 * Mapping a server result to a local state change.
 *
 * The invariant under test: a record is marked `synchronized` only when the
 * server confirmed it holds that exact record. Everything else stays queued or
 * failed, never silently dropped (docs/offline-sync.md §6).
 */
import {
  MISSING_RESULT_MESSAGE,
  TRANSPORT_FAILURE_MESSAGE,
  mapResultToLocalOutcome,
} from '../../../features/synchronization/domain/outcome-mapping';
import { SYNC_REJECTION_CODES, type SyncResult } from '../../../types/sync-contract';

const IDENTITY = { entityType: 'observation' as const, entityId: 'obs-1' };

describe('mapResultToLocalOutcome', () => {
  it('marks a synchronized record synchronized', () => {
    const outcome = mapResultToLocalOutcome({
      ...IDENTITY,
      outcome: 'synchronized',
      serverVersion: 3,
      replayed: false,
    });

    expect(outcome).toEqual({
      kind: 'synchronized',
      status: 'synchronized',
      serverVersion: 3,
      overwroteServer: false,
      previousServerVersion: null,
    });
  });

  it('treats a replayed confirmation as an ordinary confirmation', () => {
    // The server holds the record either way; a retry is not a failure.
    const outcome = mapResultToLocalOutcome({
      ...IDENTITY,
      outcome: 'synchronized',
      serverVersion: 3,
      replayed: true,
    });

    expect(outcome).toMatchObject({ kind: 'synchronized', status: 'synchronized' });
  });

  it('marks a client-wins overwrite as synchronized, not as a local conflict', () => {
    // Under client-wins the device version IS what the server now holds.
    // Marking it `conflict` would leave it queued forever and re-uploaded on
    // every run.
    const outcome = mapResultToLocalOutcome({
      ...IDENTITY,
      outcome: 'conflict_overwritten',
      serverVersion: 6,
      previousServerVersion: 5,
      replayed: false,
    });

    expect(outcome).toEqual({
      kind: 'synchronized',
      status: 'synchronized',
      serverVersion: 6,
      overwroteServer: true,
      previousServerVersion: 5,
    });
  });

  it('flags the overwrite so the run can report it', () => {
    // docs/offline-sync.md §11 — conflicts must be explicit, even when the
    // policy resolves them automatically.
    const outcome = mapResultToLocalOutcome({
      ...IDENTITY,
      outcome: 'conflict_overwritten',
      serverVersion: 2,
      previousServerVersion: 1,
      replayed: false,
    });

    expect(outcome).toMatchObject({ overwroteServer: true });
  });

  it.each(SYNC_REJECTION_CODES)('maps rejection code %s to a failure', (code) => {
    const outcome = mapResultToLocalOutcome({
      ...IDENTITY,
      outcome: 'rejected',
      code,
      reason: 'server side prose',
    });

    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') {
      expect(outcome.status).toBe('failed');
      expect(outcome.message.length).toBeGreaterThan(0);
      // The user-facing message is the client's own Spanish text, not the
      // server's English operator prose.
      expect(outcome.message).not.toBe('server side prose');
    }
  });

  it('marks a missing reference retryable and an invalid payload not', () => {
    const missing = mapResultToLocalOutcome({
      ...IDENTITY,
      outcome: 'rejected',
      code: 'missing_reference',
      reason: '',
    });
    const invalid = mapResultToLocalOutcome({
      ...IDENTITY,
      outcome: 'rejected',
      code: 'invalid_payload',
      reason: '',
    });

    expect(missing).toMatchObject({ retryable: true });
    expect(invalid).toMatchObject({ retryable: false });
  });

  it('falls back to a failure for an unrecognised rejection code', () => {
    // A newer server could send a code this build does not know. Guessing
    // "probably fine" would mark an unstored record synchronized.
    const outcome = mapResultToLocalOutcome({
      ...IDENTITY,
      outcome: 'rejected',
      code: 'quota_exceeded' as never,
      reason: '',
    } as SyncResult);

    expect(outcome).toMatchObject({ kind: 'failed', retryable: false });
  });

  it('exposes distinct messages for transport failure and a missing result', () => {
    expect(TRANSPORT_FAILURE_MESSAGE).not.toBe(MISSING_RESULT_MESSAGE);
    expect(TRANSPORT_FAILURE_MESSAGE.length).toBeGreaterThan(0);
    expect(MISSING_RESULT_MESSAGE.length).toBeGreaterThan(0);
  });
});
