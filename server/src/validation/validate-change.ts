/**
 * Server-side validation of an incoming change.
 *
 * The device already validates a draft before persisting it
 * (features/observations/domain/validation.ts), and that validation is
 * re-done here from scratch. That is not redundancy: the client is an
 * untrusted producer as far as the server is concerned, exactly as the AI
 * model is an untrusted producer as far as the client is concerned
 * (CLAUDE.md §7). A device running an older build, a corrupted row, or a
 * hand-crafted request must not be able to write a value the central schema
 * or the business rules forbid.
 *
 * Every rule here restates a constraint that also exists in
 * server/migrations/001_initial_schema.sql. The database constraint is the
 * backstop; this layer exists so a bad record comes back as a per-record
 * `rejected` with an explanation the field user can act on, instead of a
 * constraint violation that fails the whole request.
 */
import {
  ATTRIBUTE_STATUSES,
  CAPTURE_SOURCES,
  CONFIDENCE_LEVELS,
  CONVERSATION_STATUSES,
  SYNC_ENTITY_TYPES,
  SYNC_OPERATIONS,
  type SyncEntityType,
} from '../../../types/domain';
import {
  MAX_TEXT_LENGTH,
  type AttributeConfidencePayload,
  type ConversationPayload,
  type EquipmentPayload,
  type ObservationPayload,
  type ObservationSourcePayload,
  type SitePayload,
  type SyncChange,
  type SyncRejectionCode,
} from '../../../types/sync-contract';

export interface ValidationFailure {
  code: SyncRejectionCode;
  reason: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: ValidationFailure };

/** The authenticated caller. See server/src/http/authentication.ts. */
export interface Principal {
  userId: string;
  deviceId: string;
}

function invalid(reason: string): ValidationResult<never> {
  return { ok: false, failure: { code: 'invalid_payload', reason } };
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ISO-8601 UTC, matching the timestamp convention the device writes
 * (docs/database.md §17.1). A local-time or offset-bearing string is rejected
 * rather than coerced: silently reinterpreting a timestamp reorders history.
 */
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value)
  );
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function uuidField(
  source: Record<string, unknown>,
  field: string
): ValidationResult<string> {
  const value = source[field];
  if (!isUuid(value)) return invalid(`"${field}" must be a UUID`);
  return { ok: true, value };
}

function nullableUuidField(
  source: Record<string, unknown>,
  field: string
): ValidationResult<string | null> {
  const value = source[field];
  if (value === null || value === undefined) return { ok: true, value: null };
  if (!isUuid(value)) return invalid(`"${field}" must be a UUID or null`);
  return { ok: true, value };
}

function requiredText(
  source: Record<string, unknown>,
  field: string
): ValidationResult<string> {
  const value = source[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return invalid(`"${field}" is required`);
  }
  if (value.length > MAX_TEXT_LENGTH) {
    return invalid(`"${field}" exceeds ${MAX_TEXT_LENGTH} characters`);
  }
  return { ok: true, value };
}

function nullableText(
  source: Record<string, unknown>,
  field: string
): ValidationResult<string | null> {
  const value = source[field];
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== 'string') return invalid(`"${field}" must be text or null`);
  if (value.length > MAX_TEXT_LENGTH) {
    return invalid(`"${field}" exceeds ${MAX_TEXT_LENGTH} characters`);
  }
  // Empty string normalises to null so "absent" has exactly one representation.
  return { ok: true, value: value.trim().length === 0 ? null : value };
}

function nullableInteger(
  source: Record<string, unknown>,
  field: string,
  min: number,
  max: number
): ValidationResult<number | null> {
  const value = source[field];
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return invalid(`"${field}" must be an integer or null`);
  }
  if (value < min || value > max) {
    return invalid(`"${field}" must be between ${min} and ${max}`);
  }
  return { ok: true, value };
}

function nullableCoordinate(
  source: Record<string, unknown>,
  field: string,
  bound: number
): ValidationResult<number | null> {
  const value = source[field];
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return invalid(`"${field}" must be a number or null`);
  }
  if (value < -bound || value > bound) {
    return invalid(`"${field}" must be between -${bound} and ${bound}`);
  }
  return { ok: true, value };
}

function enumField<T extends string>(
  source: Record<string, unknown>,
  field: string,
  allowed: readonly T[]
): ValidationResult<T> {
  const value = source[field];
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    return invalid(`"${field}" must be one of: ${allowed.join(', ')}`);
  }
  return { ok: true, value: value as T };
}

function nullableEnumField<T extends string>(
  source: Record<string, unknown>,
  field: string,
  allowed: readonly T[]
): ValidationResult<T | null> {
  const value = source[field];
  if (value === null || value === undefined) return { ok: true, value: null };
  return enumField(source, field, allowed);
}

function timestampField(
  source: Record<string, unknown>,
  field: string
): ValidationResult<string> {
  const value = source[field];
  if (typeof value !== 'string' || !UTC_TIMESTAMP_PATTERN.test(value)) {
    return invalid(`"${field}" must be an ISO-8601 UTC timestamp`);
  }
  if (Number.isNaN(Date.parse(value))) {
    return invalid(`"${field}" is not a valid timestamp`);
  }
  return { ok: true, value };
}

function nullableTimestampField(
  source: Record<string, unknown>,
  field: string
): ValidationResult<string | null> {
  const value = source[field];
  if (value === null || value === undefined) return { ok: true, value: null };
  return timestampField(source, field);
}

function dateField(
  source: Record<string, unknown>,
  field: string
): ValidationResult<string> {
  const value = source[field];
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return invalid(`"${field}" must be a YYYY-MM-DD date`);
  }
  if (Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    return invalid(`"${field}" is not a valid date`);
  }
  return { ok: true, value };
}

/** Threads a sequence of field results, short-circuiting on the first failure. */
class FieldReader {
  private failure: ValidationFailure | null = null;

  constructor(private readonly source: Record<string, unknown>) {}

  read<T>(
    fn: (source: Record<string, unknown>) => ValidationResult<T>,
    fallback: T
  ): T {
    if (this.failure) return fallback;
    const result = fn(this.source);
    if (!result.ok) {
      this.failure = result.failure;
      return fallback;
    }
    return result.value;
  }

  get error(): ValidationFailure | null {
    return this.failure;
  }
}

// ---------------------------------------------------------------------------
// Entity payloads
// ---------------------------------------------------------------------------

function validateSite(raw: Record<string, unknown>): ValidationResult<SitePayload> {
  const r = new FieldReader(raw);
  const value: SitePayload = {
    name: r.read((s) => requiredText(s, 'name'), ''),
    country: r.read((s) => nullableText(s, 'country'), null),
    city: r.read((s) => nullableText(s, 'city'), null),
    latitude: r.read((s) => nullableCoordinate(s, 'latitude', 90), null),
    longitude: r.read((s) => nullableCoordinate(s, 'longitude', 180), null),
    address: r.read((s) => nullableText(s, 'address'), null),
    createdAt: r.read((s) => timestampField(s, 'createdAt'), ''),
    updatedAt: r.read((s) => timestampField(s, 'updatedAt'), ''),
  };
  return r.error ? { ok: false, failure: r.error } : { ok: true, value };
}

function validateEquipment(
  raw: Record<string, unknown>
): ValidationResult<EquipmentPayload> {
  const r = new FieldReader(raw);
  const value: EquipmentPayload = {
    siteId: r.read((s) => uuidField(s, 'siteId'), ''),
    brand: r.read((s) => nullableText(s, 'brand'), null),
    model: r.read((s) => nullableText(s, 'model'), null),
    modality: r.read((s) => nullableText(s, 'modality'), null),
    quantity: r.read((s) => nullableInteger(s, 'quantity', 1, Number.MAX_SAFE_INTEGER), null),
    installationYear: r.read(
      (s) => nullableInteger(s, 'installationYear', 1900, 2100),
      null
    ),
    createdAt: r.read((s) => timestampField(s, 'createdAt'), ''),
    updatedAt: r.read((s) => timestampField(s, 'updatedAt'), ''),
  };
  return r.error ? { ok: false, failure: r.error } : { ok: true, value };
}

function validateConversation(
  raw: Record<string, unknown>
): ValidationResult<ConversationPayload> {
  const r = new FieldReader(raw);
  const value: ConversationPayload = {
    userId: r.read((s) => uuidField(s, 'userId'), ''),
    startedAt: r.read((s) => timestampField(s, 'startedAt'), ''),
    endedAt: r.read((s) => nullableTimestampField(s, 'endedAt'), null),
    status: r.read((s) => enumField(s, 'status', CONVERSATION_STATUSES), 'collecting'),
    transcriptReference: r.read((s) => nullableText(s, 'transcriptReference'), null),
    summary: r.read((s) => nullableText(s, 'summary'), null),
    createdAt: r.read((s) => timestampField(s, 'createdAt'), ''),
    updatedAt: r.read((s) => timestampField(s, 'updatedAt'), ''),
  };
  return r.error ? { ok: false, failure: r.error } : { ok: true, value };
}

function validateAttributeConfidence(
  raw: unknown,
  index: number
): ValidationResult<AttributeConfidencePayload> {
  if (!isPlainObject(raw)) {
    return invalid(`"attributeConfidence[${index}]" must be an object`);
  }
  const r = new FieldReader(raw);
  const value: AttributeConfidencePayload = {
    attributeName: r.read((s) => requiredText(s, 'attributeName'), ''),
    confidenceLevel: r.read(
      (s) => enumField(s, 'confidenceLevel', CONFIDENCE_LEVELS),
      'low'
    ),
    attributeStatus: r.read(
      (s) => enumField(s, 'attributeStatus', ATTRIBUTE_STATUSES),
      'unknown'
    ),
    source: r.read((s) => nullableEnumField(s, 'source', CAPTURE_SOURCES), null),
  };
  if (r.error) {
    return {
      ok: false,
      failure: {
        code: r.error.code,
        reason: `attributeConfidence[${index}]: ${r.error.reason}`,
      },
    };
  }
  return { ok: true, value };
}

function validateObservationSource(
  raw: unknown,
  index: number
): ValidationResult<ObservationSourcePayload> {
  if (!isPlainObject(raw)) {
    return invalid(`"sources[${index}]" must be an object`);
  }
  const r = new FieldReader(raw);
  const value: ObservationSourcePayload = {
    source: r.read((s) => enumField(s, 'source', CAPTURE_SOURCES), 'text'),
    reference: r.read((s) => nullableText(s, 'reference'), null),
  };
  if (r.error) {
    return {
      ok: false,
      failure: { code: r.error.code, reason: `sources[${index}]: ${r.error.reason}` },
    };
  }
  return { ok: true, value };
}

function validateObservation(
  raw: Record<string, unknown>
): ValidationResult<ObservationPayload> {
  const r = new FieldReader(raw);
  const base = {
    siteId: r.read((s) => uuidField(s, 'siteId'), ''),
    equipmentId: r.read((s) => nullableUuidField(s, 'equipmentId'), null),
    conversationId: r.read((s) => nullableUuidField(s, 'conversationId'), null),
    visitDate: r.read((s) => dateField(s, 'visitDate'), ''),
    quantity: r.read((s) => nullableInteger(s, 'quantity', 1, Number.MAX_SAFE_INTEGER), null),
    brand: r.read((s) => nullableText(s, 'brand'), null),
    model: r.read((s) => nullableText(s, 'model'), null),
    modality: r.read((s) => nullableText(s, 'modality'), null),
    estimatedYearsOfUse: r.read(
      (s) => nullableInteger(s, 'estimatedYearsOfUse', 0, 200),
      null
    ),
    estimatedInstallationYear: r.read(
      (s) => nullableInteger(s, 'estimatedInstallationYear', 1900, 2100),
      null
    ),
    // Unconstrained on purpose: no document enumerates the allowed values,
    // and inventing a vocabulary here would silently reject valid captures
    // (CLAUDE.md §8).
    operationalStatus: r.read((s) => nullableText(s, 'operationalStatus'), null),
    captureSource: r.read(
      (s) => nullableEnumField(s, 'captureSource', CAPTURE_SOURCES),
      null
    ),
    notes: r.read((s) => nullableText(s, 'notes'), null),
    overallConfidence: r.read(
      (s) => nullableEnumField(s, 'overallConfidence', CONFIDENCE_LEVELS),
      null
    ),
    createdBy: r.read((s) => uuidField(s, 'createdBy'), ''),
    createdAt: r.read((s) => timestampField(s, 'createdAt'), ''),
    updatedAt: r.read((s) => timestampField(s, 'updatedAt'), ''),
  };

  if (r.error) return { ok: false, failure: r.error };

  const rawConfidence = raw.attributeConfidence;
  if (!Array.isArray(rawConfidence)) {
    return invalid('"attributeConfidence" must be an array');
  }
  const attributeConfidence: AttributeConfidencePayload[] = [];
  const seenAttributes = new Set<string>();
  for (let index = 0; index < rawConfidence.length; index += 1) {
    const result = validateAttributeConfidence(rawConfidence[index], index);
    if (!result.ok) return result;
    // The central schema keys these by (observation_id, attribute_name); a
    // duplicate in the payload would make the write order decide the winner.
    if (seenAttributes.has(result.value.attributeName)) {
      return invalid(
        `duplicate attributeConfidence entry for "${result.value.attributeName}"`
      );
    }
    seenAttributes.add(result.value.attributeName);
    attributeConfidence.push(result.value);
  }

  const rawSources = raw.sources;
  if (!Array.isArray(rawSources)) return invalid('"sources" must be an array');
  const sources: ObservationSourcePayload[] = [];
  for (let index = 0; index < rawSources.length; index += 1) {
    const result = validateObservationSource(rawSources[index], index);
    if (!result.ok) return result;
    sources.push(result.value);
  }

  return { ok: true, value: { ...base, attributeConfidence, sources } };
}

// ---------------------------------------------------------------------------
// Change envelope
// ---------------------------------------------------------------------------

export interface ValidatedChange {
  entityType: SyncEntityType;
  entityId: string;
  localVersion: number;
  baseServerVersion: number | null;
  updatedAt: string;
  payload: SitePayload | EquipmentPayload | ConversationPayload | ObservationPayload;
}

/**
 * Validates one change and checks it against the authenticated caller.
 *
 * The ownership check is the least-privilege rule from CLAUDE.md §15: a device
 * may upload observations and conversations attributed to the user it
 * authenticated as, and to nobody else. Without it, any authenticated device
 * could write records into another field user's name.
 */
export function validateChange(
  raw: unknown,
  principal: Principal
): ValidationResult<ValidatedChange> {
  if (!isPlainObject(raw)) return invalid('change must be an object');

  const entityTypeResult = enumField(raw, 'entityType', SYNC_ENTITY_TYPES);
  if (!entityTypeResult.ok) return entityTypeResult;
  const entityType = entityTypeResult.value;

  const entityIdResult = uuidField(raw, 'entityId');
  if (!entityIdResult.ok) return entityIdResult;

  const operationResult = enumField(raw, 'operation', SYNC_OPERATIONS);
  if (!operationResult.ok) return operationResult;
  if (operationResult.value === 'delete') {
    return {
      ok: false,
      failure: {
        code: 'unsupported_operation',
        reason:
          'Deletion is not supported: no soft-delete strategy has been ' +
          'decided (docs/database.md §16), and historical observations must ' +
          'be preserved (docs/offline-sync.md §9).',
      },
    };
  }

  const localVersion = raw.localVersion;
  if (typeof localVersion !== 'number' || !Number.isInteger(localVersion) || localVersion < 1) {
    return invalid('"localVersion" must be a positive integer');
  }

  const baseRaw = raw.baseServerVersion;
  let baseServerVersion: number | null = null;
  if (baseRaw !== null && baseRaw !== undefined) {
    if (typeof baseRaw !== 'number' || !Number.isInteger(baseRaw) || baseRaw < 1) {
      return invalid('"baseServerVersion" must be a positive integer or null');
    }
    baseServerVersion = baseRaw;
  }

  const updatedAtResult = timestampField(raw, 'updatedAt');
  if (!updatedAtResult.ok) return updatedAtResult;

  if (!isPlainObject(raw.payload)) return invalid('"payload" must be an object');
  const rawPayload = raw.payload;

  let payloadResult: ValidationResult<ValidatedChange['payload']>;
  switch (entityType) {
    case 'site':
      payloadResult = validateSite(rawPayload);
      break;
    case 'equipment':
      payloadResult = validateEquipment(rawPayload);
      break;
    case 'conversation':
      payloadResult = validateConversation(rawPayload);
      break;
    case 'observation':
      payloadResult = validateObservation(rawPayload);
      break;
  }
  if (!payloadResult.ok) return payloadResult;
  const payload = payloadResult.value;

  if (entityType === 'observation') {
    const observation = payload as ObservationPayload;
    if (observation.createdBy !== principal.userId) {
      return {
        ok: false,
        failure: {
          code: 'not_owned_by_principal',
          reason: 'An observation may only be uploaded by the user who created it.',
        },
      };
    }
  }

  if (entityType === 'conversation') {
    const conversation = payload as ConversationPayload;
    if (conversation.userId !== principal.userId) {
      return {
        ok: false,
        failure: {
          code: 'not_owned_by_principal',
          reason: 'A conversation may only be uploaded by the user it belongs to.',
        },
      };
    }
  }

  return {
    ok: true,
    value: {
      entityType,
      entityId: entityIdResult.value,
      localVersion,
      baseServerVersion,
      updatedAt: updatedAtResult.value,
      payload,
    },
  };
}

/** Re-exported so the HTTP layer can narrow a raw body without duplicating it. */
export function isChangeArray(value: unknown): value is SyncChange[] {
  return Array.isArray(value);
}
