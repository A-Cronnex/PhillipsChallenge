/**
 * Wire contract for `POST /v1/sync`.
 *
 * Shared deliberately by both sides: the mobile client builds these objects
 * (`features/synchronization/`), the server parses and re-validates them
 * (`server/src/`). It lives in `types/` because CLAUDE.md §16 names that
 * folder as the home for shared contracts, and because a drifting copy on
 * either side is how a sync protocol silently starts losing records.
 *
 * Scope: this contract covers the **upload (push)** direction only. The
 * download direction needs a cursor whose storage is still undecided
 * (docs/database.md §17.2) and a soft-delete/tombstone strategy that is also
 * undecided (docs/database.md §16); see docs/sync-api.md §10.
 *
 * Naming: the wire uses camelCase. The local SQLite columns are snake_case and
 * the Postgres columns are snake_case; the mapping is done at each edge, not
 * leaked into the protocol.
 */
import type { SyncEntityType, SyncOperation } from './domain';
import type {
  AttributeStatus,
  CaptureSource,
  ConfidenceLevel,
  ConversationStatus,
} from './domain';

/** Versioned path, per docs/architecture.md §11. */
export const SYNC_API_VERSION = 'v1';
export const SYNC_ENDPOINT_PATH = '/v1/sync';

/**
 * Maximum changes the server accepts in one request.
 *
 * A cap is what makes synchronization resumable (docs/offline-sync.md §7): the
 * client uploads in chunks, and an interrupted run leaves the un-sent chunks
 * `pending` instead of losing a single oversized request. 50 is a starting
 * value chosen to keep a request small on a poor connection, not a measured
 * one — see docs/sync-api.md §11.
 */
export const MAX_CHANGES_PER_BATCH = 50;

/** Guards against a single free-text field making a request unbounded. */
export const MAX_TEXT_LENGTH = 4000;

// ---------------------------------------------------------------------------
// Entity payloads
// ---------------------------------------------------------------------------

/**
 * The full state of the entity as the device holds it.
 *
 * Full state, not a field-level diff, because the confirmed conflict policy is
 * client-wins (docs/offline-sync.md §8): the device version replaces the
 * server's outright, so there is nothing for the server to merge field by
 * field. A diff format would imply a merge the policy says does not happen.
 */
export interface SitePayload {
  name: string;
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentPayload {
  siteId: string;
  brand: string | null;
  model: string | null;
  modality: string | null;
  quantity: number | null;
  installationYear: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationPayload {
  userId: string;
  startedAt: string;
  endedAt: string | null;
  status: ConversationStatus;
  transcriptReference: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-attribute confidence rows, uploaded as part of their observation.
 *
 * They have no independent sync record (see `SYNC_ENTITY_TYPES` in
 * ./domain.ts): an observation and its children are written atomically
 * (docs/database.md §12), so they travel together.
 */
export interface AttributeConfidencePayload {
  attributeName: string;
  confidenceLevel: ConfidenceLevel;
  attributeStatus: AttributeStatus;
  source: CaptureSource | null;
}

export interface ObservationSourcePayload {
  source: CaptureSource;
  /**
   * Filesystem pointer to the captured artifact on the device. Uploaded as an
   * opaque string: the artifact itself (photo, audio) is NOT transferred by
   * this endpoint. Binary upload is a separate, undecided concern
   * (docs/sync-api.md §10).
   */
  reference: string | null;
}

export interface ObservationPayload {
  siteId: string;
  equipmentId: string | null;
  conversationId: string | null;
  visitDate: string;
  quantity: number | null;
  brand: string | null;
  model: string | null;
  modality: string | null;
  estimatedYearsOfUse: number | null;
  estimatedInstallationYear: number | null;
  operationalStatus: string | null;
  captureSource: CaptureSource | null;
  /** Stored in the user's original language (docs/tech-stack.md §7.2). */
  notes: string | null;
  overallConfidence: ConfidenceLevel | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  attributeConfidence: AttributeConfidencePayload[];
  sources: ObservationSourcePayload[];
}

export type SyncPayload =
  | SitePayload
  | EquipmentPayload
  | ConversationPayload
  | ObservationPayload;

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export interface SyncChange {
  entityType: SyncEntityType;
  /** The stable UUID the record was created with (docs/offline-sync.md §7). */
  entityId: string;
  operation: SyncOperation;
  /** `sync_records.local_version` at the moment the change was claimed. */
  localVersion: number;
  /**
   * `sync_records.server_version` — the server version this device last saw,
   * or `null` if it has never synchronized this entity.
   *
   * This is the entire basis of conflict detection: if the server's current
   * version differs from this, the record changed on the server since the
   * device last saw it.
   */
  baseServerVersion: number | null;
  /** The entity's own `updated_at`, ISO-8601 UTC. */
  updatedAt: string;
  payload: unknown;
}

export interface SyncRequest {
  /**
   * Stable per-installation identifier. Used for replay detection, so a
   * retried request is recognised as the same request and not applied twice
   * (docs/offline-sync.md §7).
   */
  deviceId: string;
  clientTime: string;
  changes: SyncChange[];
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

/**
 * Per-record outcomes, as proposed in docs/architecture.md §11.
 *
 * `conflict_overwritten` is `conflict` from that table, named for what
 * client-wins actually does: the record IS stored, and the server state it
 * replaced is archived rather than discarded. Naming it plain `conflict` would
 * suggest the client should retry, which under client-wins it must not.
 */
export const SYNC_OUTCOMES = [
  'synchronized',
  'conflict_overwritten',
  'rejected',
] as const;
export type SyncOutcome = (typeof SYNC_OUTCOMES)[number];

/**
 * Why a change was refused.
 *
 * Split from the human-readable reason so the client can branch on the code
 * without parsing prose, and so the prose can be changed without breaking a
 * client.
 */
export const SYNC_REJECTION_CODES = [
  /** Payload failed schema, enum, or range validation on the server. */
  'invalid_payload',
  /** `operation: 'delete'` — no soft-delete strategy is decided yet. */
  'unsupported_operation',
  /** The change claims to belong to a user other than the caller. */
  'not_owned_by_principal',
  /** A referenced site / equipment / conversation / user is unknown here. */
  'missing_reference',
  /** The server failed to store the record; the client should retry. */
  'storage_error',
] as const;
export type SyncRejectionCode = (typeof SYNC_REJECTION_CODES)[number];

interface SyncResultIdentity {
  entityType: SyncEntityType;
  entityId: string;
}

export type SyncResult = SyncResultIdentity &
  (
    | {
        outcome: 'synchronized';
        /** The version the record now holds on the server. */
        serverVersion: number;
        /** True when this exact change had already been applied before. */
        replayed: boolean;
      }
    | {
        outcome: 'conflict_overwritten';
        serverVersion: number;
        /** The server version that the device version replaced. */
        previousServerVersion: number;
        replayed: boolean;
      }
    | {
        outcome: 'rejected';
        code: SyncRejectionCode;
        /**
         * Human-readable explanation, stored by the client in
         * `sync_records.last_error`. Must never echo the payload back — that
         * would put hospital data into a log line (CLAUDE.md §15).
         */
        reason: string;
      }
  );

export interface SyncResponse {
  serverTime: string;
  results: SyncResult[];
}

/**
 * Whole-request failure: the batch was never applied.
 *
 * Distinct from a per-record `rejected`, which means the rest of the batch
 * WAS applied. The client must not mark anything synchronized on this.
 */
export interface SyncErrorResponse {
  error: {
    code:
      | 'malformed_request'
      | 'batch_too_large'
      | 'unauthenticated'
      | 'internal_error';
    message: string;
  };
}
