/**
 * Business-rule validation for a manually captured observation.
 *
 * Validation lives in the domain layer, not in the form: the same rules must
 * apply to observations proposed by the AI agent, which is an untrusted
 * producer whose output is never persisted unchecked (CLAUDE.md §7).
 *
 * Issues carry a stable `code`, not a message. The presentation layer owns the
 * wording so that user-facing text stays in the user's language and can move to
 * i18n resources without touching domain code (docs/tech-stack.md §7.1).
 */
import {
  CONFIDENCE_ATTRIBUTES,
  attributeValue,
  type ObservationDraft,
  type ValidatedObservationDraft,
} from './observation';

export type ValidationCode =
  | 'site_required'
  | 'visit_date_required'
  | 'visit_date_malformed'
  | 'visit_date_in_future'
  | 'identifying_attribute_required'
  | 'quantity_not_positive'
  | 'quantity_not_integer'
  | 'years_of_use_negative'
  | 'years_of_use_not_integer'
  | 'installation_year_out_of_range'
  | 'installation_year_not_integer'
  | 'confidence_without_value';

export interface ValidationIssue {
  /** Draft field the issue belongs to, so the form can anchor the message. */
  field: string;
  code: ValidationCode;
  /** Extra context for message interpolation, e.g. the allowed year range. */
  params?: Record<string, string | number>;
}

export type ValidationResult =
  | { ok: true; value: ValidatedObservationDraft }
  | { ok: false; issues: ValidationIssue[] };

/** Mirrors the CHECK constraint in migration 001. */
export const MIN_INSTALLATION_YEAR = 1900;
export const MAX_INSTALLATION_YEAR = 2100;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * PROPOSED business rule — pending confirmation.
 *
 * An observation must identify the equipment it is about by at least one of
 * brand, model or modality. Without any of them the record says a visit
 * happened but nothing about what was seen, which cannot be reconciled against
 * an equipment record later or counted in a dashboard.
 *
 * docs/domain-model.md §6 lists these attributes without marking any required,
 * and docs/ai-agent.md §5 implies some are required without saying which. If
 * the business wants to allow site-level visit records with no equipment
 * information, delete this rule — nothing else depends on it.
 */
export const REQUIRE_IDENTIFYING_ATTRIBUTE = true;

function isBlank(value: string | null): boolean {
  return value === null || value.trim().length === 0;
}

/**
 * Validates a draft against the domain rules.
 *
 * `today` is injected rather than read from the clock so that the
 * future-date rule is testable and so the caller controls the timezone the
 * comparison happens in.
 */
export function validateObservationDraft(
  draft: ObservationDraft,
  today: string
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (isBlank(draft.siteId)) {
    issues.push({ field: 'siteId', code: 'site_required' });
  }

  if (isBlank(draft.visitDate)) {
    issues.push({ field: 'visitDate', code: 'visit_date_required' });
  } else if (!ISO_DATE.test(draft.visitDate!)) {
    issues.push({ field: 'visitDate', code: 'visit_date_malformed' });
  } else if (Number.isNaN(Date.parse(`${draft.visitDate}T00:00:00Z`))) {
    issues.push({ field: 'visitDate', code: 'visit_date_malformed' });
  } else if (draft.visitDate! > today) {
    // A visit cannot have happened in the future. Lexicographic comparison is
    // valid for zero-padded ISO dates.
    issues.push({ field: 'visitDate', code: 'visit_date_in_future' });
  }

  if (
    REQUIRE_IDENTIFYING_ATTRIBUTE &&
    isBlank(draft.brand) &&
    isBlank(draft.model) &&
    isBlank(draft.modality)
  ) {
    issues.push({ field: 'brand', code: 'identifying_attribute_required' });
  }

  if (draft.quantity !== null) {
    if (!Number.isInteger(draft.quantity)) {
      issues.push({ field: 'quantity', code: 'quantity_not_integer' });
    } else if (draft.quantity <= 0) {
      issues.push({ field: 'quantity', code: 'quantity_not_positive' });
    }
  }

  if (draft.estimatedYearsOfUse !== null) {
    if (!Number.isInteger(draft.estimatedYearsOfUse)) {
      issues.push({
        field: 'estimatedYearsOfUse',
        code: 'years_of_use_not_integer',
      });
    } else if (draft.estimatedYearsOfUse < 0) {
      issues.push({
        field: 'estimatedYearsOfUse',
        code: 'years_of_use_negative',
      });
    }
  }

  if (draft.estimatedInstallationYear !== null) {
    if (!Number.isInteger(draft.estimatedInstallationYear)) {
      issues.push({
        field: 'estimatedInstallationYear',
        code: 'installation_year_not_integer',
      });
    } else if (
      draft.estimatedInstallationYear < MIN_INSTALLATION_YEAR ||
      draft.estimatedInstallationYear > MAX_INSTALLATION_YEAR
    ) {
      issues.push({
        field: 'estimatedInstallationYear',
        code: 'installation_year_out_of_range',
        params: { min: MIN_INSTALLATION_YEAR, max: MAX_INSTALLATION_YEAR },
      });
    }
  }

  // A confidence value with no corresponding attribute value would create an
  // attribute_confidence row describing nothing.
  for (const attribute of CONFIDENCE_ATTRIBUTES) {
    if (draft.attributeConfidence[attribute] === undefined) continue;
    const value = attributeValue(draft, attribute);
    if (value === null || (typeof value === 'string' && value.trim() === '')) {
      issues.push({
        field: `attributeConfidence.${attribute}`,
        code: 'confidence_without_value',
        params: { attribute },
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: draft as ValidatedObservationDraft };
}
