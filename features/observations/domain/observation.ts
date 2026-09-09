/**
 * Observation domain entity.
 *
 * An Observation is information collected about equipment during a visit; it
 * is not the equipment itself (docs/domain-model.md §5–§6). Observations are
 * append-only — a newer one never replaces an older one
 * (docs/domain-model.md §14).
 *
 * These types are deliberately free of React and React Native types
 * (CLAUDE.md §5). The string-shaped values a form actually holds are mapped
 * into an `ObservationDraft` by the presentation layer
 * (`features/observations/ui/form-mapping.ts`).
 */
import type {
  AttributeStatus,
  CaptureSource,
  ConfidenceLevel,
} from '../../../types/domain';

/**
 * Attributes that carry their own confidence and status.
 *
 * Taken from the worked example in docs/domain-model.md §7. `installation_year`
 * is the confidence key for the observation's `estimated_installation_year`
 * value; the two names differ because the documentation names them that way.
 */
export const CONFIDENCE_ATTRIBUTES = [
  'brand',
  'model',
  'modality',
  'installation_year',
  'operational_status',
] as const;
export type ConfidenceAttribute = (typeof CONFIDENCE_ATTRIBUTES)[number];

/** Per-attribute confidence chosen by the user, for attributes they filled in. */
export type AttributeConfidenceSelection = Partial<
  Record<ConfidenceAttribute, ConfidenceLevel>
>;

/**
 * What the user is proposing to save, with values already coerced to their
 * domain types but not yet validated.
 */
export interface ObservationDraft {
  siteId: string | null;
  /**
   * Null until duplicate detection links this observation to an equipment
   * record. Capture must not block on that resolution (CLAUDE.md §6).
   */
  equipmentId: string | null;
  /** Calendar date of the visit, `YYYY-MM-DD`. */
  visitDate: string | null;
  quantity: number | null;
  brand: string | null;
  model: string | null;
  modality: string | null;
  estimatedYearsOfUse: number | null;
  estimatedInstallationYear: number | null;
  operationalStatus: string | null;
  notes: string | null;
  attributeConfidence: AttributeConfidenceSelection;
}

/**
 * Marker for a draft that passed validation.
 *
 * Declared but never assigned, so the only way to obtain a
 * `ValidatedObservationDraft` is through `validateObservationDraft`. That makes
 * "this was validated" a fact the compiler checks rather than a convention
 * someone can forget — persistence code cannot accept an unvalidated draft by
 * accident (CLAUDE.md §7).
 */
declare const validatedBrand: unique symbol;

/** A draft that has passed validation. Only produced by `validateObservationDraft`. */
export interface ValidatedObservationDraft extends ObservationDraft {
  readonly [validatedBrand]: true;
  siteId: string;
  visitDate: string;
}

/** One attribute's confidence, status and source, ready to persist. */
export interface AttributeConfidenceRecord {
  attributeName: ConfidenceAttribute;
  confidenceLevel: ConfidenceLevel;
  attributeStatus: AttributeStatus;
  source: CaptureSource;
}

/**
 * A fully-formed observation with its child records, ready for the repository.
 *
 * Identifiers and timestamps are assigned by the application layer, never by
 * the database (docs/database.md §5).
 */
export interface NewObservation {
  id: string;
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
  captureSource: CaptureSource;
  notes: string | null;
  overallConfidence: ConfidenceLevel | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  attributeConfidence: AttributeConfidenceRecord[];
  sources: Array<{ source: CaptureSource; reference: string | null }>;
}

/** An empty draft, used to initialise the capture form. */
export function emptyObservationDraft(): ObservationDraft {
  return {
    siteId: null,
    equipmentId: null,
    visitDate: null,
    quantity: null,
    brand: null,
    model: null,
    modality: null,
    estimatedYearsOfUse: null,
    estimatedInstallationYear: null,
    operationalStatus: null,
    notes: null,
    attributeConfidence: {},
  };
}

/**
 * The draft value corresponding to a confidence attribute, used to check that
 * a confidence selection actually refers to a filled-in field.
 */
export function attributeValue(
  draft: ObservationDraft,
  attribute: ConfidenceAttribute
): string | number | null {
  switch (attribute) {
    case 'brand':
      return draft.brand;
    case 'model':
      return draft.model;
    case 'modality':
      return draft.modality;
    case 'installation_year':
      return draft.estimatedInstallationYear;
    case 'operational_status':
      return draft.operationalStatus;
  }
}
