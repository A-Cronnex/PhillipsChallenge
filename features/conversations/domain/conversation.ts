/**
 * Conversation state.
 *
 * The status values are exactly those in docs/ai-agent.md §11, and the same
 * set the `conversations.status` CHECK constraint enforces (migration 001), so
 * a conversation can always be persisted in whatever state it is in.
 *
 * No React, no QVAC, no SQL: this is the part of the agent that must be
 * testable without a device (docs/ai-agent.md §12).
 */
import type {
  AttributeStatus,
  CaptureSource,
  ConfidenceLevel,
  ConversationStatus,
} from '../../../types/domain';
import {
  CAPTURE_FIELDS,
  REQUIRED_FIELDS,
  type CaptureField,
} from './fields';

/**
 * What is known about one field, and what the agent has already tried in
 * order to learn it.
 */
export interface FieldState {
  field: CaptureField;
  value: string | number | null;
  /** docs/domain-model.md §8. `unknown` until something is captured. */
  status: AttributeStatus;
  confidence: ConfidenceLevel | null;
  /** Which input mode produced the value. Null while unknown. */
  source: CaptureSource | null;
  /**
   * How many times the agent has asked for a photo *specifically* for this
   * field. §3a caps this at one re-request before offering voice.
   */
  photoRequests: number;
  /** Whether the agent has already offered the voice fallback for this field. */
  voiceSuggested: boolean;
}

export interface ConversationTurn {
  role: 'user' | 'agent';
  /** Text shown or spoken. Stored in the user's language (docs/tech-stack.md §7.2). */
  text: string;
  source: CaptureSource;
  /** Local file path of an image or audio artifact, when there was one. */
  reference?: string | null;
  at: string;
  /**
   * Agent turns only: a recap of every field known once this turn was
   * produced, e.g. "Hasta ahora registré — la marca: Philips." Rendered as a
   * small indicator above the turn's own text, never inside it (product
   * requirement, 2026-09-10) — it is a status snapshot, not something the
   * agent "said".
   */
  capturedSummary?: string | null;
}

export interface ConversationState {
  id: string;
  userId: string;
  status: ConversationStatus;
  startedAt: string;
  fields: Record<CaptureField, FieldState>;
  turns: ConversationTurn[];
  /** The field the agent is currently asking about, if any. */
  pendingField: CaptureField | null;
  /** Set when inference failed, so the UI can offer retry (docs/ai-agent.md §13). */
  lastError: string | null;
  /** Local-only recovery reference. Proposed image values are not applied yet. */
  pendingImagePath?: string | null;
}

function emptyFieldState(field: CaptureField): FieldState {
  return {
    field,
    value: null,
    status: 'unknown',
    confidence: null,
    source: null,
    photoRequests: 0,
    voiceSuggested: false,
  };
}

export function emptyFieldStates(): Record<CaptureField, FieldState> {
  const states = {} as Record<CaptureField, FieldState>;
  for (const field of CAPTURE_FIELDS) states[field] = emptyFieldState(field);
  return states;
}

export function startConversation(
  id: string,
  userId: string,
  startedAt: string
): ConversationState {
  return {
    id,
    userId,
    status: 'collecting',
    startedAt,
    fields: emptyFieldStates(),
    turns: [],
    pendingField: null,
    lastError: null,
  };
}

/** A field counts as known once it holds a value that is not `unknown`. */
export function isKnown(state: FieldState): boolean {
  return state.value !== null && state.status !== 'unknown';
}

export function missingRequiredFields(
  conversation: ConversationState
): CaptureField[] {
  return REQUIRED_FIELDS.filter(
    (field) => !isKnown(conversation.fields[field])
  );
}

export function isComplete(conversation: ConversationState): boolean {
  return missingRequiredFields(conversation).length === 0;
}

/**
 * Records a captured value for one field.
 *
 * Never overwrites a value that is already `confirmed` with a weaker one: a
 * value read off a nameplate should not be replaced by a later guess
 * (docs/domain-model.md §8, docs/ai-agent.md §6).
 */
const STATUS_STRENGTH: Record<AttributeStatus, number> = {
  unknown: 0,
  estimated: 1,
  reported: 2,
  confirmed: 3,
};

export function recordField(
  conversation: ConversationState,
  field: CaptureField,
  captured: {
    value: string | number | null;
    status: AttributeStatus;
    confidence: ConfidenceLevel | null;
    source: CaptureSource;
  }
): ConversationState {
  const current = conversation.fields[field];

  if (
    isKnown(current) &&
    STATUS_STRENGTH[captured.status] < STATUS_STRENGTH[current.status]
  ) {
    return conversation;
  }

  return {
    ...conversation,
    fields: {
      ...conversation.fields,
      [field]: { ...current, ...captured },
    },
  };
}

/** Marks that the agent asked for another photo of a specific field (§3a). */
export function recordPhotoRequest(
  conversation: ConversationState,
  field: CaptureField
): ConversationState {
  const current = conversation.fields[field];
  return {
    ...conversation,
    pendingField: field,
    status: 'awaiting_clarification',
    fields: {
      ...conversation.fields,
      [field]: { ...current, photoRequests: current.photoRequests + 1 },
    },
  };
}

/** Marks that the agent offered the voice fallback for a field (§3a). */
export function recordVoiceSuggestion(
  conversation: ConversationState,
  field: CaptureField
): ConversationState {
  const current = conversation.fields[field];
  return {
    ...conversation,
    pendingField: field,
    status: 'awaiting_clarification',
    fields: {
      ...conversation.fields,
      [field]: { ...current, voiceSuggested: true },
    },
  };
}

export function addTurn(
  conversation: ConversationState,
  turn: ConversationTurn
): ConversationState {
  return { ...conversation, turns: [...conversation.turns, turn] };
}

/**
 * Recomputes the conversation status from what is known.
 *
 * `saved` and `failed` are terminal and are never re-derived — they are set by
 * the application layer once persistence has actually happened or definitively
 * not happened.
 */
export function deriveStatus(
  conversation: ConversationState
): ConversationStatus {
  if (conversation.status === 'saved' || conversation.status === 'failed') {
    return conversation.status;
  }
  if (conversation.status === 'ready_to_save') return 'ready_to_save';
  if (conversation.pendingField !== null) return 'awaiting_clarification';
  if (isComplete(conversation)) return 'awaiting_confirmation';
  return 'collecting';
}

export function withDerivedStatus(
  conversation: ConversationState
): ConversationState {
  return { ...conversation, status: deriveStatus(conversation) };
}
