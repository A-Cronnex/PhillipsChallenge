/**
 * Mapping between the form's string-shaped state and the domain draft.
 *
 * Text inputs hold strings; the domain works in numbers and nulls. That
 * conversion is a presentation concern, which is why it lives here and not in
 * `domain/` — the domain must not grow a type shaped by how a text input
 * happens to store its value (CLAUDE.md §5).
 *
 * Unparseable numbers are passed through as `NaN` rather than being silently
 * dropped, so that domain validation reports "not a whole number" instead of
 * the field appearing empty and the user losing what they typed.
 */
import type { ConfidenceLevel } from '../../../types/domain';
import type {
  AttributeConfidenceSelection,
  ObservationDraft,
} from '../domain/observation';

export interface ObservationFormValues {
  siteId: string | null;
  equipmentId?: string | null;
  visitDate: string;
  quantity: string;
  brand: string;
  model: string;
  modality: string;
  estimatedYearsOfUse: string;
  estimatedInstallationYear: string;
  operationalStatus: string;
  notes: string;
  attributeConfidence: AttributeConfidenceSelection;
}

export function emptyFormValues(
  overrides: Partial<ObservationFormValues> = {}
): ObservationFormValues {
  return {
    siteId: null,
    visitDate: '',
    quantity: '',
    brand: '',
    model: '',
    modality: '',
    estimatedYearsOfUse: '',
    estimatedInstallationYear: '',
    operationalStatus: '',
    notes: '',
    attributeConfidence: {},
    ...overrides,
  };
}

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Number('') is 0, which is why the blank check comes first.
  return Number(trimmed);
}

function orNull(raw: string): string | null {
  return raw.trim().length === 0 ? null : raw;
}

export function toDraft(values: ObservationFormValues): ObservationDraft {
  return {
    siteId: values.siteId,
    // The user explicitly selects an existing item; null requests a new equipment record.
    equipmentId: values.equipmentId ?? null,
    visitDate: orNull(values.visitDate),
    quantity: parseNumber(values.quantity),
    brand: orNull(values.brand),
    model: orNull(values.model),
    modality: orNull(values.modality),
    estimatedYearsOfUse: parseNumber(values.estimatedYearsOfUse),
    estimatedInstallationYear: parseNumber(values.estimatedInstallationYear),
    operationalStatus: orNull(values.operationalStatus),
    notes: orNull(values.notes),
    attributeConfidence: values.attributeConfidence,
  };
}

export function setConfidence(
  values: ObservationFormValues,
  attribute: keyof AttributeConfidenceSelection,
  level: ConfidenceLevel | undefined
): ObservationFormValues {
  const next = { ...values.attributeConfidence };
  if (level === undefined) {
    delete next[attribute];
  } else {
    next[attribute] = level;
  }
  return { ...values, attributeConfidence: next };
}
