/**
 * Validation of model output (docs/ai-agent.md §7 and §8, CLAUDE.md §7).
 *
 * The model is an untrusted producer. Nothing it returns reaches a domain
 * object without passing through here first, and this module never throws on
 * bad input — it reports, so the agent can ask again instead of crashing.
 *
 * Written by hand rather than with a schema library: the rules are few, and an
 * explicit validator makes it obvious that every field is checked, which is
 * the property CLAUDE.md §7 actually asks for.
 */
import {
  ATTRIBUTE_STATUSES,
  CONFIDENCE_LEVELS,
  type AttributeStatus,
  type ConfidenceLevel,
} from '../../../types/domain';
import { CAPTURE_FIELDS, type CaptureField } from './fields';

/** One field the model claims to have extracted. */
export interface ExtractedValue {
  field: CaptureField;
  value: string | number | null;
  status: AttributeStatus;
  confidence: ConfidenceLevel;
}

export interface AgentExtraction {
  values: ExtractedValue[];
  /** Vision assessment, never a persisted equipment attribute. Missing is inconclusive. */
  nameplate?: 'detected' | 'not_detected' | 'uncertain';
}

/**
 * Something the application refused to take from the model, with enough
 * context to show it or log it. Every stage that rejects model output reports
 * in this shape — schema parsing here, business rules in `value-rules.ts`,
 * the original-language guard in `language.ts` — so a caller can concatenate
 * them into one list instead of handling three vocabularies.
 */
export interface AgentIssue<Code extends string = string> {
  path: string;
  code: Code;
  detail?: string;
}

export type ExtractionIssue = AgentIssue<
  | 'not_an_object'
  | 'unknown_field'
  | 'invalid_value_type'
  | 'invalid_status'
  | 'invalid_confidence'
>;

export type ExtractionParseResult =
  | { ok: true; extraction: AgentExtraction; rejected: ExtractionIssue[] }
  | { ok: false; issues: ExtractionIssue[] };

const CAPTURE_FIELD_SET = new Set<string>(CAPTURE_FIELDS);
const STATUS_SET = new Set<string>(ATTRIBUTE_STATUSES);
const CONFIDENCE_SET = new Set<string>(CONFIDENCE_LEVELS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses whatever the model returned.
 *
 * Individual bad entries are dropped and reported in `rejected` rather than
 * failing the whole extraction: a model that gets nine fields right and
 * hallucinates a tenth should still contribute the nine, and the tenth must
 * leave a trace rather than disappear.
 *
 * The whole parse fails only when the payload is not an object at all, or has
 * no usable `values` array — at that point there is nothing to salvage.
 */
export function parseExtraction(raw: unknown): ExtractionParseResult {
  if (!isRecord(raw)) {
    return {
      ok: false,
      issues: [{ path: '$', code: 'not_an_object' }],
    };
  }

  const rawValues = raw.values;
  if (!Array.isArray(rawValues)) {
    return {
      ok: false,
      issues: [{ path: '$.values', code: 'not_an_object', detail: 'expected an array' }],
    };
  }

  const values: ExtractedValue[] = [];
  const rejected: ExtractionIssue[] = [];

  rawValues.forEach((entry, index) => {
    const path = `$.values[${index}]`;

    if (!isRecord(entry)) {
      rejected.push({ path, code: 'not_an_object' });
      return;
    }

    const field = entry.field;
    if (typeof field !== 'string' || !CAPTURE_FIELD_SET.has(field)) {
      // A field name the domain does not define. Never persisted, never
      // silently mapped onto something similar (CLAUDE.md §8).
      rejected.push({
        path: `${path}.field`,
        code: 'unknown_field',
        detail: String(field),
      });
      return;
    }

    const value = entry.value;
    const valueOk =
      value === null || typeof value === 'string' || typeof value === 'number';
    if (!valueOk) {
      rejected.push({ path: `${path}.value`, code: 'invalid_value_type' });
      return;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      rejected.push({
        path: `${path}.value`,
        code: 'invalid_value_type',
        detail: 'not finite',
      });
      return;
    }

    const status = entry.status;
    if (typeof status !== 'string' || !STATUS_SET.has(status)) {
      rejected.push({
        path: `${path}.status`,
        code: 'invalid_status',
        detail: String(status),
      });
      return;
    }

    const confidence = entry.confidence;
    if (typeof confidence !== 'string' || !CONFIDENCE_SET.has(confidence)) {
      rejected.push({
        path: `${path}.confidence`,
        code: 'invalid_confidence',
        detail: String(confidence),
      });
      return;
    }

    values.push({
      field: field as CaptureField,
      value,
      status: status as AttributeStatus,
      confidence: confidence as ConfidenceLevel,
    });
  });

  const nameplate = raw.nameplate;
  return { ok: true, extraction: { values,
    ...(nameplate === 'detected' || nameplate === 'not_detected' || nameplate === 'uncertain' ? { nameplate } : {}),
  }, rejected };
}

/**
 * Drops values the model claims but that contradict §5.
 *
 * A model that reports a value while calling it `unknown` is contradicting
 * itself; docs/ai-agent.md §5 says an unknown value is stored as `unknown`,
 * not invented. Keeping the status and discarding the value is the reading
 * that never fabricates.
 */
export function normalizeExtraction(
  extraction: AgentExtraction
): AgentExtraction {
  return {
    ...extraction,
    values: extraction.values.map((value) =>
      value.status === 'unknown' ? { ...value, value: null } : value
    ),
  };
}

/**
 * The JSON shape the model is instructed to produce (docs/ai-agent.md §7).
 *
 * There used to be a `reasoning` string ahead of `values`, forcing the
 * grammar to give the model a free-text scratchpad before it committed to
 * categorical fields (schema-ordering chain-of-thought under
 * grammar-constrained decoding). Removed (2026-09-10): it measurably slowed
 * every turn and produced unparseable output often enough to matter, and it
 * cannot be replaced by MedPsy's native `<think>` channel either — that
 * channel has to emit before generation starts, but `responseFormat:
 * json_schema` (`services/ai/qvac-runtime.ts`) compiles this schema to a GBNF
 * grammar that constrains sampling from the very first token, so there is no
 * point in the request where free-form reasoning tokens are legal. Extraction
 * is a single grammar-constrained pass with no reasoning step.
 */
export const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    values: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string', enum: [...CAPTURE_FIELDS] },
          value: { type: ['string', 'number', 'null'] },
          status: { type: 'string', enum: [...ATTRIBUTE_STATUSES] },
          confidence: { type: 'string', enum: [...CONFIDENCE_LEVELS] },
        },
        required: ['field', 'value', 'status', 'confidence'],
      },
    },
  },
  required: ['values'],
} as const;

/**
 * The vision variant: the same shape plus the nameplate assessment (§3a).
 *
 * Shared by the prompt text and the decoding grammar so the model is asked
 * for, and constrained to, exactly one shape.
 */
export const VISION_EXTRACTION_JSON_SCHEMA = {
  ...EXTRACTION_JSON_SCHEMA,
  properties: {
    ...EXTRACTION_JSON_SCHEMA.properties,
    nameplate: {
      type: 'string',
      enum: ['detected', 'not_detected', 'uncertain'],
    },
  },
  required: [...EXTRACTION_JSON_SCHEMA.required, 'nameplate'],
} as const;
