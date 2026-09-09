/**
 * Shared domain enumerations.
 *
 * These are the single source of truth for the values enforced by the
 * SQLite CHECK constraints in `database/migrations/`. If a value is added
 * here it must also be added to the corresponding migration, and vice
 * versa — see `tests/database/migrations.test.ts`, which asserts that the
 * database rejects anything outside these sets.
 *
 * Source: docs/domain-model.md §3, §8, §9; docs/offline-sync.md §4;
 * docs/ai-agent.md §11.
 */

/** docs/domain-model.md §3 — controls access to application functionality. */
export const USER_ROLES = ['field_user', 'sales', 'medical_staff'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** docs/domain-model.md §9 — how an attribute or observation was captured. */
export const CAPTURE_SOURCES = ['voice', 'text', 'image'] as const;
export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

/** docs/domain-model.md §8 — per-attribute verification status. */
export const ATTRIBUTE_STATUSES = [
  'confirmed',
  'reported',
  'estimated',
  'unknown',
] as const;
export type AttributeStatus = (typeof ATTRIBUTE_STATUSES)[number];

/**
 * docs/domain-model.md §7, docs/ai-agent.md §9.
 * Used both per attribute and for an observation's derived overall value.
 * The rule deriving the overall value from the per-attribute values is a
 * domain concern and is not implemented here (docs/domain-model.md §15).
 */
export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/** docs/ai-agent.md §11 — conversation state machine. */
export const CONVERSATION_STATUSES = [
  'collecting',
  'awaiting_clarification',
  'awaiting_confirmation',
  'ready_to_save',
  'saved',
  'failed',
] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

/** docs/offline-sync.md §4 — synchronization state of a local record. */
export const SYNC_STATUSES = [
  'local_only',
  'pending',
  'syncing',
  'synchronized',
  'failed',
  'conflict',
] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

/** docs/domain-model.md §11 — the pending operation a sync record represents. */
export const SYNC_OPERATIONS = ['create', 'update', 'delete'] as const;
export type SyncOperation = (typeof SYNC_OPERATIONS)[number];

/**
 * Entity types tracked by `sync_records`.
 *
 * `observation_sources` and `attribute_confidence` are intentionally absent:
 * they are owned by an observation and synchronize as part of it, never
 * independently (docs/database.md §12 — the observation and its children are
 * written atomically).
 */
export const SYNC_ENTITY_TYPES = [
  'site',
  'equipment',
  'observation',
  'conversation',
] as const;
export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

/**
 * Local cache state of an offline map region (docs/offline-sync.md §11–§12).
 * Deliberately separate from SYNC_STATUSES: map resources and business data
 * are synchronized separately and must not share a state field.
 */
export const MAP_REGION_STATUSES = [
  'not_downloaded',
  'downloading',
  'downloaded',
  'failed',
] as const;
export type MapRegionStatus = (typeof MAP_REGION_STATUSES)[number];
