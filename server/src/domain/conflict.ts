/**
 * The client-wins decision (docs/offline-sync.md §8).
 *
 * Deliberately a pure function over two small records. Deciding what to do
 * with an incoming change involves no I/O, so it is separated from the code
 * that performs the write and can be tested exhaustively without a database —
 * which matters, because this is the one place where getting it wrong loses a
 * field user's data silently.
 */
import type { SyncOutcome } from '../../../types/sync-contract';

/** What the server currently knows about one synchronized entity. */
export interface EntitySyncState {
  serverVersion: number;
  /** The device whose change produced `serverVersion`. */
  lastAppliedDeviceId: string;
  /** That device's `local_version` for the change. */
  lastAppliedLocalVersion: number;
  /** The outcome reported for it, so a replay reports the same thing. */
  lastOutcome: Extract<SyncOutcome, 'synchronized' | 'conflict_overwritten'>;
  /** For a `conflict_overwritten` outcome, the version it replaced. */
  lastPreviousVersion: number | null;
}

/** The identifying part of an incoming change; the payload is irrelevant here. */
export interface ChangeIdentity {
  deviceId: string;
  localVersion: number;
  baseServerVersion: number | null;
}

export type SyncDecision =
  | {
      /**
       * This exact change was already applied. Report the stored outcome and
       * touch nothing — the request is a retry whose first response was lost
       * (docs/offline-sync.md §7).
       */
      kind: 'replay';
      outcome: EntitySyncState['lastOutcome'];
      serverVersion: number;
      previousServerVersion: number | null;
    }
  | {
      /** Write the payload. `overwritten` is non-null only on a conflict. */
      kind: 'apply';
      nextServerVersion: number;
      /**
       * The server version being replaced by a *diverged* client version.
       * Non-null means client-wins actually overrode something, and the
       * replaced state must be archived before the write
       * (docs/offline-sync.md §11).
       */
      overwrittenServerVersion: number | null;
    };

/**
 * Decides how to handle one incoming change.
 *
 * Order of the checks matters:
 *
 * 1. **Replay first.** A retry is not a conflict. Checking divergence first
 *    would report a false `conflict_overwritten` for every re-sent request,
 *    because the server version has already moved past the client's base.
 * 2. **Unknown entity → insert.** A `baseServerVersion` pointing at a version
 *    the server has never held is not treated as a conflict: there is no
 *    server state to overwrite, so client-wins just stores the record. See
 *    docs/sync-api.md §7 for the caveat this hides.
 * 3. **Divergence → client-wins overwrite.** Any mismatch between the client's
 *    base version and the server's current version means the record changed on
 *    the server since this device last saw it. The device version is stored
 *    anyway (that is the policy), and the caller archives what it replaced.
 */
export function decideSync(
  current: EntitySyncState | null,
  change: ChangeIdentity
): SyncDecision {
  if (
    current !== null &&
    current.lastAppliedDeviceId === change.deviceId &&
    current.lastAppliedLocalVersion === change.localVersion
  ) {
    return {
      kind: 'replay',
      outcome: current.lastOutcome,
      serverVersion: current.serverVersion,
      previousServerVersion: current.lastPreviousVersion,
    };
  }

  if (current === null) {
    return { kind: 'apply', nextServerVersion: 1, overwrittenServerVersion: null };
  }

  const diverged = current.serverVersion !== change.baseServerVersion;

  return {
    kind: 'apply',
    nextServerVersion: current.serverVersion + 1,
    overwrittenServerVersion: diverged ? current.serverVersion : null,
  };
}
