/**
 * Business-rule validation of the values the model claims to have extracted
 * (docs/ai-agent.md §8).
 *
 * `extraction.ts` answers "is this the right *shape*" — an object, a known
 * field name, a legal status and confidence. This module answers "is this a
 * legal *value*": numeric ranges, geographic values, text limits. The two are
 * separate because they fail differently: a malformed payload means the model
 * misunderstood the contract, whereas a year of 3025 means the model
 * understood the contract and hallucinated inside it.
 *
 * Nothing here throws and nothing here repairs a value into something the
 * model did not say. A value that fails is dropped and reported, so the field
 * stays missing and the agent asks again (docs/ai-agent.md §5 — never invent).
 *
 * The numeric bounds mirror the CHECK constraints in migration 001 on purpose:
 * a value that passes here must be storable. `MIN_INSTALLATION_YEAR` /
 * `MAX_INSTALLATION_YEAR` are imported from the observations domain rather
 * than redeclared, because a conversation ultimately produces an observation
 * and two copies of the same range would drift.
 */
import {
  MAX_INSTALLATION_YEAR,
  MIN_INSTALLATION_YEAR,
} from '../../observations/domain/validation';
import type { AgentIssue } from './extraction';
import type { ExtractedValue } from './extraction';
import { CAPTURE_FIELD_SPECS, type CaptureField } from './fields';

export type ValueRuleCode =
  | 'not_a_number'
  | 'not_an_integer'
  | 'out_of_range'
  | 'empty_text'
  | 'text_too_long'
  | 'not_a_place_name';

export type ValueIssue = AgentIssue<ValueRuleCode>;

/**
 * PROPOSED bounds — pending confirmation.
 *
 * Migration 001 constrains `quantity > 0` and `estimated_years_of_use >= 0`
 * with no upper bound, which is correct for a database but useless against a
 * model that answers "1200000 monitors". docs/ai-agent.md §8 requires numeric
 * ranges to be validated, and a range needs two ends, so these upper bounds
 * exist. They are deliberately generous: they exist to catch a hallucination,
 * not to second-guess a large hospital.
 *
 * If the business rejects them, change them here — nothing else encodes them.
 */
export const MAX_QUANTITY = 10_000;
export const MAX_YEARS_OF_USE = 100;

/**
 * PROPOSED text limits — pending confirmation. `notes` is prose, the rest are
 * labels. The limits guard against a model that returns its whole reasoning
 * transcript as a field value; the database itself imposes no length.
 */
export const MAX_NOTES_LENGTH = 2_000;
export const MAX_LABEL_LENGTH = 200;

/** Place names have no digits in them; a "city" of "12345" is model noise. */
const HAS_DIGIT = /\d/;

/** Only a value that is entirely a number is coerced. "5 equipos" is not. */
const NUMERIC_TEXT = /^[+-]?\d+(\.\d+)?$/;

export type ValueRuleResult =
  | { ok: true; value: string | number }
  | { ok: false; code: ValueRuleCode; detail?: string };

function integerRange(field: CaptureField): { min: number; max: number } {
  switch (field) {
    case 'quantity':
      return { min: 1, max: MAX_QUANTITY };
    case 'estimatedYearsOfUse':
      return { min: 0, max: MAX_YEARS_OF_USE };
    case 'estimatedInstallationYear':
      return { min: MIN_INSTALLATION_YEAR, max: MAX_INSTALLATION_YEAR };
    default:
      // Unreachable while `kind` and this switch agree; kept explicit so that
      // adding an integer field without a range fails loudly instead of
      // silently accepting anything.
      throw new Error(`No numeric range defined for field "${field}"`);
  }
}

function maxLengthFor(field: CaptureField): number {
  return field === 'notes' ? MAX_NOTES_LENGTH : MAX_LABEL_LENGTH;
}

/**
 * Validates one extracted value against the rules for its field.
 *
 * A numeric string is coerced to a number: models routinely return `"5"` for a
 * count, and dropping that would lose a value the user really did give. The
 * coercion is exact — no parsing of "cinco", no stripping of units — so it
 * cannot turn text into a number the user never said.
 */
export function validateExtractedValue(
  field: CaptureField,
  value: string | number
): ValueRuleResult {
  const spec = CAPTURE_FIELD_SPECS[field];

  if (spec.kind === 'integer') {
    let numeric: number;
    if (typeof value === 'number') {
      numeric = value;
    } else if (NUMERIC_TEXT.test(value.trim())) {
      numeric = Number(value.trim());
    } else {
      return { ok: false, code: 'not_a_number', detail: value };
    }

    if (!Number.isFinite(numeric)) {
      return { ok: false, code: 'not_a_number' };
    }
    if (!Number.isInteger(numeric)) {
      return { ok: false, code: 'not_an_integer', detail: String(numeric) };
    }

    const { min, max } = integerRange(field);
    if (numeric < min || numeric > max) {
      return { ok: false, code: 'out_of_range', detail: `${min}..${max}` };
    }
    return { ok: true, value: numeric };
  }

  // Text fields. A number where text is expected is accepted as its own
  // string form ("2024" as a site name is odd but not invalid); place names
  // are the exception below.
  const text = String(value).trim();
  if (text.length === 0) {
    return { ok: false, code: 'empty_text' };
  }
  if (text.length > maxLengthFor(field)) {
    return {
      ok: false,
      code: 'text_too_long',
      detail: String(maxLengthFor(field)),
    };
  }

  // docs/ai-agent.md §8 "Geographic values". Offline and with no confirmed
  // gazetteer dataset (CLAUDE.md §18 leaves reference data undecided), this
  // is the strongest check available: a country or city is a name, not a
  // number and not a paragraph. It is a shape check, not a lookup — it will
  // accept a misspelled or non-existent city, which is why the value still
  // carries its own confidence and status.
  if (field === 'country' || field === 'city') {
    if (HAS_DIGIT.test(text)) {
      return { ok: false, code: 'not_a_place_name', detail: text };
    }
  }

  return { ok: true, value: text };
}

export interface ValueRuleOutcome {
  values: ExtractedValue[];
  issues: ValueIssue[];
}

/**
 * Applies the rules to a whole extraction.
 *
 * Values of `null` pass through untouched: `null` means "the model did not
 * find this", which is a legitimate answer (§5) and not something to validate.
 */
export function validateExtractedValues(
  values: ExtractedValue[]
): ValueRuleOutcome {
  const kept: ExtractedValue[] = [];
  const issues: ValueIssue[] = [];

  for (const entry of values) {
    if (entry.value === null) {
      kept.push(entry);
      continue;
    }

    const result = validateExtractedValue(entry.field, entry.value);
    if (!result.ok) {
      issues.push({
        path: `$.values.${entry.field}`,
        code: result.code,
        detail: result.detail,
      });
      continue;
    }

    kept.push({ ...entry, value: result.value });
  }

  return { values: kept, issues };
}
