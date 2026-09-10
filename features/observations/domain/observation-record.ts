/**
 * Read-side shape of a persisted `Observation`, and the pure search/sort
 * rules applied to a list of them.
 *
 * Deliberately not `NewObservation` (domain/observation.ts): that type is the
 * write path's fully-formed record, with the child rows attached
 * (attributeConfidence, sources) that persistence needs and a list screen
 * does not. This is the read model for "one row already in the database",
 * plus `syncStatus` — which is not an Observation attribute
 * (docs/domain-model.md §6 does not list it) but a `sync_records` fact about
 * it, kept as an explicit separate field rather than folded into the entity,
 * matching how map data keeps business attributes and cache state apart
 * (CLAUDE.md §10).
 *
 * `notes` is included here (the repository reads it) but no screen in this
 * feature renders it inline — it is shown only through the dedicated note
 * action, per the product decision that a note is consulted deliberately,
 * not scanned as part of the card.
 */
import type { ConfidenceLevel, CaptureSource, SyncStatus } from '../../../types/domain';

export interface ObservationRecord {
  id: string;
  equipmentId: string | null;
  siteId: string;
  visitDate: string;
  quantity: number | null;
  brand: string | null;
  model: string | null;
  modality: string | null;
  estimatedYearsOfUse: number | null;
  estimatedInstallationYear: number | null;
  operationalStatus: string | null;
  captureSource: CaptureSource | null;
  notes: string | null;
  overallConfidence: ConfidenceLevel | null;
  createdBy: string;
  /** `users.name` for whoever `createdBy` refers to; null if that user record is gone. */
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  /** From `sync_records`; null only if no sync record exists yet for this row. */
  syncStatus: SyncStatus | null;
}

export type ObservationSortOrder =
  | 'visit_date_desc'
  | 'visit_date_asc'
  | 'brand_asc';

export const OBSERVATION_SORT_ORDERS: ObservationSortOrder[] = [
  'visit_date_desc',
  'visit_date_asc',
  'brand_asc',
];

/**
 * Free-text search across the attributes that identify what was seen, plus
 * the note — a field user searching a site's history is typically looking
 * for "the MR from BluePeak" or a phrase they remember writing, not a date or
 * a confidence level (those are filters/sorts, not search terms).
 */
export function matchesObservationQuery(
  observation: ObservationRecord,
  query: string
): boolean {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) return true;

  return [observation.brand, observation.model, observation.modality, observation.notes]
    .filter((value): value is string => value !== null)
    .some((value) => value.toLowerCase().includes(trimmed));
}

function compareNullableStrings(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // nulls sort last regardless of direction
  if (b === null) return -1;
  return a.localeCompare(b);
}

export function sortObservations(
  observations: ObservationRecord[],
  order: ObservationSortOrder
): ObservationRecord[] {
  const copy = [...observations];
  switch (order) {
    case 'visit_date_desc':
      return copy.sort((a, b) => b.visitDate.localeCompare(a.visitDate));
    case 'visit_date_asc':
      return copy.sort((a, b) => a.visitDate.localeCompare(b.visitDate));
    case 'brand_asc':
      return copy.sort((a, b) => compareNullableStrings(a.brand, b.brand));
  }
}
