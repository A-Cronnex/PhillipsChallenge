import type { ConversationRepository } from './ports';
import { type ConversationState, addTurn } from '../domain/conversation';
import { attributeConfidenceRecords } from '../domain/confidence';
import { deriveOverallConfidence } from '../../observations/domain/confidence';
import { validateObservationDraft } from '../../observations/domain/validation';
import type { ObservationDraft, NewObservation } from '../../observations/domain/observation';

/** Review is a user action. AI output never calls this service directly. */
export async function saveConversation(state: ConversationState, draft: ObservationDraft, deps: {
  repository: ConversationRepository; now: () => Date; newId: () => string;
}): Promise<void> {
  if (state.status === 'saved') return;
  const timestamp = deps.now().toISOString();
  const result = validateObservationDraft(draft, timestamp.slice(0, 10));
  if (!result.ok) throw new Error('Revisa los campos requeridos, las fechas, las cantidades y la confianza antes de guardar.');
  const valid = result.value;
  const original = attributeConfidenceRecords(state);
  const fieldByAttribute = { brand: 'brand', model: 'model', modality: 'modality', installation_year: 'estimatedInstallationYear', operational_status: 'operationalStatus' } as const;
  const attributes = Object.entries(valid.attributeConfidence).flatMap(([key, level]) => {
    const attribute = key as keyof typeof fieldByAttribute;
    if (!level) return [];
    const field = fieldByAttribute[attribute];
    const previous = original.find(row => row.attributeName === attribute);
    if (previous && state.fields[field].value === valid[field] && previous.confidenceLevel === level) return [previous];
    return [{ attributeName: attribute, confidenceLevel: level, attributeStatus: 'reported' as const, source: 'text' as const }];
  });
  const sources = state.turns.filter(turn => turn.role === 'user').map(turn => ({ source: turn.source, reference: turn.reference ?? null }));
  // Keep all original artifacts, plus the user's final text review.
  sources.push({ source: 'text', reference: null });
  const observation: NewObservation = { ...valid, id: deps.newId(), conversationId: state.id,
    captureSource: sources[0].source, createdBy: state.userId, createdAt: timestamp, updatedAt: timestamp,
    overallConfidence: deriveOverallConfidence(attributes.map(row => row.confidenceLevel)),
    attributeConfidence: attributes, sources };
  const reviewed: ConversationState = { ...state, fields: { ...state.fields } };
  for (const [key, field] of Object.entries(state.fields)) {
    if (!(key in valid)) continue;
    const value = valid[key as keyof ObservationDraft];
    if (value !== null && typeof value !== 'string' && typeof value !== 'number') continue;
    if (value === field.value) continue;
    const row = attributes.find(item => fieldByAttribute[item.attributeName] === key);
    reviewed.fields[field.field] = { ...field, value, status: value === null ? 'unknown' : 'reported',
      source: 'text', confidence: row?.confidenceLevel ?? null };
  }
  const withReview = addTurn(reviewed, { role: 'user', source: 'text', at: timestamp,
    text: 'Revisión confirmada: ' + JSON.stringify(draft) });
  await deps.repository.finalize(withReview, observation);
}
