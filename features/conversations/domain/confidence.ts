/**
 * Per-attribute confidence for a capture conversation (docs/ai-agent.md §9).
 *
 * §9 requires two distinct things, and they are implemented in two places:
 *
 * - "Confidence should be stored per attribute" — the model reports a
 *   confidence per extracted field, `extraction.ts` validates it against the
 *   allowed levels, and `ConversationState.fields[field].confidence` holds it.
 *   This module turns those into the `attribute_confidence` rows the schema
 *   expects.
 * - "The overall confidence must be calculated by an explicit rule" — the rule
 *   already exists for manual capture in
 *   `features/observations/domain/confidence.ts`. It is *reused* here rather
 *   than reimplemented: an observation captured by talking to the agent and
 *   the same observation typed into the form must not end up with different
 *   overall confidence because they took different code paths.
 *
 * Nothing here writes to the database. It produces the values an application
 * service will hand to the observation repository once conversation →
 * observation conversion is built (docs/ai-agent-implementation.md §4).
 */
import type { AttributeStatus, ConfidenceLevel } from '../../../types/domain';
import { deriveOverallConfidence } from '../../observations/domain/confidence';
import type {
  AttributeConfidenceRecord,
  ConfidenceAttribute,
} from '../../observations/domain/observation';
import { isKnown, type ConversationState } from './conversation';
import { CAPTURE_FIELDS, type CaptureField } from './fields';

/**
 * Which capture fields carry their own confidence.
 *
 * The set is `CONFIDENCE_ATTRIBUTES` from the observations domain
 * (docs/domain-model.md §7), mapped onto the field names the conversation
 * uses. `estimatedInstallationYear` and `installation_year` are the same thing
 * under two names because the documentation names them that way, and the
 * mapping is written out here so that mismatch is visible rather than assumed.
 *
 * Fields absent from this map — quantity, site name, city, country, years of
 * use, notes — are still captured with a confidence in the conversation, but
 * docs/domain-model.md §7 does not model attribute confidence for them, so
 * they produce no `attribute_confidence` row and do not affect the overall
 * value. Inventing rows for them would be inventing fields (CLAUDE.md §8).
 */
export const FIELD_CONFIDENCE_ATTRIBUTE: Partial<
  Record<CaptureField, ConfidenceAttribute>
> = {
  brand: 'brand',
  model: 'model',
  modality: 'modality',
  estimatedInstallationYear: 'installation_year',
  operationalStatus: 'operational_status',
};

/**
 * PROPOSED coherence rule — pending confirmation.
 *
 * A value the model itself calls `estimated` — approximate information, per
 * docs/domain-model.md §8 — cannot also be high confidence; the two statements
 * contradict each other, and taking the model at its word on both would let a
 * guess be presented as near-certain on the dashboard. The estimate is capped
 * at `medium`, never raised.
 *
 * `unknown` carries no confidence at all: there is no value to be confident
 * about (`normalizeExtraction` has already discarded it).
 *
 * `confirmed` and `reported` pass through unchanged.
 *
 * This is a rule the documentation does not state. It is applied where model
 * output enters the conversation, and it only ever lowers a claim, so the
 * worst case if it is wrong is an understated confidence — never an
 * overstated one.
 */
export function capConfidenceByStatus(
  status: AttributeStatus,
  confidence: ConfidenceLevel | null
): ConfidenceLevel | null {
  if (status === 'unknown') return null;
  if (status === 'estimated' && confidence === 'high') return 'medium';
  return confidence;
}

/**
 * The `attribute_confidence` rows implied by a conversation.
 *
 * Only fields that are actually known produce a row: a row describing a field
 * with no value would say nothing, which is the same rule the manual
 * validator enforces with `confidence_without_value`.
 */
export function attributeConfidenceRecords(
  conversation: ConversationState
): AttributeConfidenceRecord[] {
  const records: AttributeConfidenceRecord[] = [];

  for (const field of CAPTURE_FIELDS) {
    const attribute = FIELD_CONFIDENCE_ATTRIBUTE[field];
    if (attribute === undefined) continue;

    const state = conversation.fields[field];
    if (!isKnown(state)) continue;
    if (state.confidence === null || state.source === null) continue;

    records.push({
      attributeName: attribute,
      confidenceLevel: state.confidence,
      attributeStatus: state.status,
      // docs/domain-model.md §9: the source that produced the attribute is
      // kept, not overwritten by whatever the last turn happened to be.
      source: state.source,
    });
  }

  return records;
}

/**
 * The observation-level confidence for a conversation, by the same explicit
 * rule manual capture uses (docs/ai-agent.md §9, docs/domain-model.md §7).
 *
 * Null when no attribute carries a confidence — an observation with nothing to
 * derive from is not "low confidence", it is unrated, and the two must not be
 * conflated on a dashboard.
 */
export function conversationOverallConfidence(
  conversation: ConversationState
): ConfidenceLevel | null {
  return deriveOverallConfidence(
    attributeConfidenceRecords(conversation).map(
      (record) => record.confidenceLevel
    )
  );
}
