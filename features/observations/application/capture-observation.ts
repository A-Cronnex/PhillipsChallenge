/**
 * Application service for manual observation capture.
 *
 * Orchestrates the capture workflow: validate the draft against domain rules,
 * assemble the record, and persist it locally together with its
 * synchronization record. It performs no network call and never waits on one
 * (CLAUDE.md §6) — the observation is durable on the device before the user is
 * told it was saved.
 *
 * It contains no SQL and no React. The repository arrives as a port, and the
 * clock and id generator are injected so the workflow is deterministic in
 * tests.
 */
import type { ConfidenceLevel, SyncStatus } from '../../../types/domain';
import { deriveOverallConfidence } from '../domain/confidence';
import {
  CONFIDENCE_ATTRIBUTES,
  type AttributeConfidenceRecord,
  type NewObservation,
  type ObservationDraft,
} from '../domain/observation';
import {
  validateObservationDraft,
  type ValidationIssue,
} from '../domain/validation';
import type { ObservationRepository, SavedObservation } from './ports';

/**
 * The synchronization state a freshly captured observation is saved with
 * (docs/offline-sync.md §4–§5).
 *
 * `pending`, not `local_only`: the record is persisted locally and is waiting
 * to be uploaded. That no transport exists yet does not change its intent, and
 * starting at `local_only` would mean migrating every existing row the day a
 * backend is confirmed. `local_only` stays reserved for records deliberately
 * never synchronized.
 *
 * Consequence to be aware of: until a backend exists (docs/tech-stack.md §5)
 * every record stays `pending` forever, and the UI must not present that as an
 * error — it is the correct state for a device that has nothing to sync to.
 */
export const INITIAL_SYNC_STATUS: SyncStatus = 'pending';

/**
 * Manually typed values are `reported`: provided by the user without
 * verification (docs/domain-model.md §8). They are not `confirmed`, which
 * requires a reliable source, and not `estimated`, which the user would have
 * to declare explicitly.
 */
const MANUAL_ATTRIBUTE_STATUS = 'reported' as const;

/** This screen is keyboard entry, so every value came from `text`. */
const MANUAL_CAPTURE_SOURCE = 'text' as const;

export interface CaptureObservationDeps {
  repository: ObservationRepository;
  /** Injected for determinism in tests. */
  now: () => Date;
  newId: () => string;
}

export type CaptureObservationOutcome =
  | { status: 'validation_failed'; issues: ValidationIssue[] }
  | { status: 'saved'; saved: SavedObservation }
  | { status: 'failed'; reason: string };

function trimToNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** `YYYY-MM-DD` in UTC, matching the timestamp convention in docs/database.md §17.1. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function captureObservation(
  draft: ObservationDraft,
  createdBy: string,
  deps: CaptureObservationDeps
): Promise<CaptureObservationOutcome> {
  const now = deps.now();
  const validation = validateObservationDraft(draft, toIsoDate(now));

  if (!validation.ok) {
    return { status: 'validation_failed', issues: validation.issues };
  }

  const valid = validation.value;
  const timestamp = now.toISOString();

  const attributeConfidence: AttributeConfidenceRecord[] =
    CONFIDENCE_ATTRIBUTES.flatMap((attribute) => {
      const level = valid.attributeConfidence[attribute];
      if (level === undefined) return [];
      return [
        {
          attributeName: attribute,
          confidenceLevel: level,
          attributeStatus: MANUAL_ATTRIBUTE_STATUS,
          source: MANUAL_CAPTURE_SOURCE,
        },
      ];
    });

  const levels: ConfidenceLevel[] = attributeConfidence.map(
    (record) => record.confidenceLevel
  );

  const observation: NewObservation = {
    id: deps.newId(),
    siteId: valid.siteId,
    equipmentId: valid.equipmentId,
    // Manual capture is not an AI conversation (docs/domain-model.md §12).
    conversationId: null,
    visitDate: valid.visitDate,
    quantity: valid.quantity,
    brand: trimToNull(valid.brand),
    model: trimToNull(valid.model),
    modality: trimToNull(valid.modality),
    estimatedYearsOfUse: valid.estimatedYearsOfUse,
    estimatedInstallationYear: valid.estimatedInstallationYear,
    operationalStatus: trimToNull(valid.operationalStatus),
    captureSource: MANUAL_CAPTURE_SOURCE,
    // Stored in the language the user typed (docs/tech-stack.md §7.2).
    notes: trimToNull(valid.notes),
    overallConfidence: deriveOverallConfidence(levels),
    createdBy,
    createdAt: timestamp,
    updatedAt: timestamp,
    attributeConfidence,
    sources: [{ source: MANUAL_CAPTURE_SOURCE, reference: null }],
  };

  try {
    const saved = await deps.repository.save(observation, INITIAL_SYNC_STATUS);
    return { status: 'saved', saved };
  } catch (error) {
    // The transaction rolled back, so nothing partial was written. The caller
    // keeps the draft on screen so the user's input is not lost (CLAUDE.md §6).
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
