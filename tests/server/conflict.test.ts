/**
 * The client-wins decision (docs/offline-sync.md §8).
 *
 * Exercised exhaustively because every branch here is a way to lose a field
 * user's data: a missed replay duplicates work and reports a false conflict, a
 * missed divergence overwrites the server without saying so, and a wrong
 * version number desynchronizes the device permanently.
 */
import {
  decideSync,
  type ChangeIdentity,
  type EntitySyncState,
} from '../../server/src/domain/conflict';

const DEVICE_A = 'device-a';
const DEVICE_B = 'device-b';

function state(overrides: Partial<EntitySyncState> = {}): EntitySyncState {
  return {
    serverVersion: 3,
    lastAppliedDeviceId: DEVICE_A,
    lastAppliedLocalVersion: 7,
    lastOutcome: 'synchronized',
    lastPreviousVersion: null,
    ...overrides,
  };
}

function change(overrides: Partial<ChangeIdentity> = {}): ChangeIdentity {
  return {
    deviceId: DEVICE_A,
    localVersion: 8,
    baseServerVersion: 3,
    ...overrides,
  };
}

describe('decideSync', () => {
  describe('first upload of an entity', () => {
    it('inserts at version 1 when the server has never seen it', () => {
      const decision = decideSync(null, change({ baseServerVersion: null }));

      expect(decision).toEqual({
        kind: 'apply',
        nextServerVersion: 1,
        overwrittenServerVersion: null,
      });
    });

    it('does not report a conflict when the client claims a base the server never held', () => {
      // A device whose record says "server version 4" against a server that has
      // no such entity. There is nothing to overwrite, so client-wins simply
      // stores it. Documented in docs/sync-api.md §7 as a case this cannot
      // distinguish from server-side data loss.
      const decision = decideSync(null, change({ baseServerVersion: 4 }));

      expect(decision).toEqual({
        kind: 'apply',
        nextServerVersion: 1,
        overwrittenServerVersion: null,
      });
    });
  });

  describe('clean update', () => {
    it('increments the version when the client is up to date', () => {
      const decision = decideSync(
        state({ serverVersion: 3 }),
        change({ baseServerVersion: 3, localVersion: 8 })
      );

      expect(decision).toEqual({
        kind: 'apply',
        nextServerVersion: 4,
        overwrittenServerVersion: null,
      });
    });
  });

  describe('divergence — client wins', () => {
    it('overwrites and reports the version it replaced', () => {
      const decision = decideSync(
        state({ serverVersion: 5 }),
        change({ baseServerVersion: 3, localVersion: 8 })
      );

      expect(decision).toEqual({
        kind: 'apply',
        nextServerVersion: 6,
        overwrittenServerVersion: 5,
      });
    });

    it('treats a null base against an existing server record as divergence', () => {
      // The device believes it never synchronized this entity, but the server
      // has it — two devices created the same id, or the local sync record was
      // reset. Storing it silently would erase the server's copy with no trace.
      const decision = decideSync(
        state({ serverVersion: 2 }),
        change({ baseServerVersion: null })
      );

      expect(decision).toEqual({
        kind: 'apply',
        nextServerVersion: 3,
        overwrittenServerVersion: 2,
      });
    });

    it('treats a base ahead of the server as divergence too', () => {
      const decision = decideSync(
        state({ serverVersion: 2 }),
        change({ baseServerVersion: 9 })
      );

      expect(decision).toMatchObject({ overwrittenServerVersion: 2 });
    });
  });

  describe('replay', () => {
    it('recognises the same device re-sending the same local version', () => {
      const decision = decideSync(
        state({
          serverVersion: 4,
          lastAppliedDeviceId: DEVICE_A,
          lastAppliedLocalVersion: 8,
        }),
        change({ deviceId: DEVICE_A, localVersion: 8, baseServerVersion: 3 })
      );

      expect(decision).toEqual({
        kind: 'replay',
        outcome: 'synchronized',
        serverVersion: 4,
        previousServerVersion: null,
      });
    });

    it('replays the original conflict outcome, not a fresh one', () => {
      const decision = decideSync(
        state({
          serverVersion: 6,
          lastAppliedDeviceId: DEVICE_A,
          lastAppliedLocalVersion: 8,
          lastOutcome: 'conflict_overwritten',
          lastPreviousVersion: 5,
        }),
        change({ deviceId: DEVICE_A, localVersion: 8, baseServerVersion: 3 })
      );

      expect(decision).toEqual({
        kind: 'replay',
        outcome: 'conflict_overwritten',
        serverVersion: 6,
        previousServerVersion: 5,
      });
    });

    it('does not bump the version when a request is retried', () => {
      // The whole point of idempotency (docs/offline-sync.md §7): a retry whose
      // first response was lost must not be applied twice.
      const current = state({
        serverVersion: 4,
        lastAppliedDeviceId: DEVICE_A,
        lastAppliedLocalVersion: 8,
      });
      const retried = change({ deviceId: DEVICE_A, localVersion: 8 });

      const first = decideSync(current, retried);
      const second = decideSync(current, retried);

      expect(first).toEqual(second);
      expect(first).toMatchObject({ kind: 'replay', serverVersion: 4 });
    });

    it('does not treat another device sending the same local version as a replay', () => {
      // Both devices happen to be at local_version 8. Skipping device B's
      // change as a "replay" would discard its work silently — the exact
      // device-vs-device hazard docs/offline-sync.md §8 warns about.
      const decision = decideSync(
        state({ lastAppliedDeviceId: DEVICE_A, lastAppliedLocalVersion: 8, serverVersion: 4 }),
        change({ deviceId: DEVICE_B, localVersion: 8, baseServerVersion: 3 })
      );

      expect(decision).toMatchObject({
        kind: 'apply',
        nextServerVersion: 5,
        overwrittenServerVersion: 4,
      });
    });

    it('does not treat a newer local version from the same device as a replay', () => {
      const decision = decideSync(
        state({ lastAppliedDeviceId: DEVICE_A, lastAppliedLocalVersion: 8, serverVersion: 4 }),
        change({ deviceId: DEVICE_A, localVersion: 9, baseServerVersion: 4 })
      );

      expect(decision).toMatchObject({ kind: 'apply', nextServerVersion: 5 });
    });
  });
});
