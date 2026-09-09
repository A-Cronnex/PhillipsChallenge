/**
 * Vision-first capture flow (docs/ai-agent.md §3a).
 *
 * Encoded as a pure decision function so the rules are testable without a
 * device — QVAC cannot run on an emulator (docs/ai-agent.md §12), so if these
 * rules lived inside the inference call they could not be tested at all.
 *
 * The four rules from §3a, and where each is enforced:
 *
 * 1. "Do not ask for a second photo indefinitely — one re-request per missing
 *    field is enough before offering the voice fallback."
 *    → `MAX_PHOTO_REQUESTS_PER_FIELD`, checked in `decideNextAction`.
 * 2. "The switch to voice is a suggestion, not forced; the user can keep
 *    trying with photos if they prefer."
 *    → the action is `suggest_voice`, and `acceptsMorePhotos` stays true, so
 *      the UI keeps the camera available.
 * 3. "Fields already confirmed from an earlier photo are not re-asked when the
 *    flow falls back to voice."
 *    → only fields failing `isKnown` are ever considered.
 * 4. "This flow applies per missing/required field, not once for the whole
 *    observation."
 *    → decisions are made for one field at a time, and a conversation can hold
 *      some fields captured by image and others by voice at the same time.
 */
import {
  isKnown,
  type ConversationState,
} from './conversation';
import {
  CAPTURE_FIELD_SPECS,
  REQUIRED_FIELDS,
  isVisionReadable,
  type CaptureField,
} from './fields';

/**
 * One re-request per field. §3a's "one re-request is enough" counts the
 * *targeted* ask that follows a first photo which did not show the field.
 */
export const MAX_PHOTO_REQUESTS_PER_FIELD = 1;

export type NextAction =
  | { type: 'ask_photo'; field: CaptureField; reason: 'field_not_visible' }
  | { type: 'suggest_voice'; field: CaptureField }
  | { type: 'ask_field'; field: CaptureField }
  | { type: 'confirm' };

/**
 * Missing required fields, in the order the agent should pursue them.
 *
 * Vision-readable fields come first: the user is standing in front of the
 * equipment with a camera, and answering them costs one photo rather than a
 * sentence each.
 */
export function pendingFields(
  conversation: ConversationState
): CaptureField[] {
  const missing = REQUIRED_FIELDS.filter(
    (field) => !isKnown(conversation.fields[field])
  );
  return [
    ...missing.filter(isVisionReadable),
    ...missing.filter((field) => !isVisionReadable(field)),
  ];
}

/**
 * Decides what the agent does next.
 *
 * `hadPhoto` says whether the user has already provided at least one photo in
 * this conversation. Before any photo exists there is nothing to re-request,
 * so a vision-readable field is asked for by photo as the first attempt.
 */
export function decideNextAction(
  conversation: ConversationState,
  options: { hadPhoto: boolean }
): NextAction {
  const pending = pendingFields(conversation);
  if (pending.length === 0) return { type: 'confirm' };

  const field = pending[0];
  const state = conversation.fields[field];

  if (!isVisionReadable(field)) {
    // A photo cannot show this. Asking for one would waste a field visit.
    return { type: 'ask_field', field };
  }

  if (state.photoRequests < MAX_PHOTO_REQUESTS_PER_FIELD) {
    // Either no photo yet, or a photo arrived that did not show this field.
    // Either way, one targeted request is allowed (rule 1).
    return { type: 'ask_photo', field, reason: 'field_not_visible' };
  }

  if (!state.voiceSuggested) {
    // The re-request has been spent. Offer voice (rule 1's fallback).
    return { type: 'suggest_voice', field };
  }

  // Voice already offered and the field is still missing: keep the
  // conversation going by asking for the value directly, in whatever mode the
  // user prefers. Never loop back to more photo requests (rule 1).
  void options;
  return { type: 'ask_field', field };
}

/**
 * Whether the UI should still offer the camera for a field.
 *
 * Always true while the field is vision-readable: §3a rule 2 makes the voice
 * switch a suggestion, so the user may keep trying with photos even after the
 * agent has stopped asking for them.
 */
export function acceptsMorePhotos(field: CaptureField): boolean {
  return CAPTURE_FIELD_SPECS[field].visionReadable;
}

/**
 * Fields a photo should be analysed against.
 *
 * Only missing, vision-readable fields: re-reading a field already captured
 * from an earlier photo risks a blurrier second read overwriting a good one,
 * and §3a rule 3 says confirmed fields are not re-asked.
 */
export function visionTargetsFor(
  conversation: ConversationState
): CaptureField[] {
  return REQUIRED_FIELDS.concat(
    // Optional vision-readable fields are opportunistic: if the nameplate
    // happens to show the installation year, take it, but never ask again for it.
    (['model', 'estimatedInstallationYear'] as CaptureField[])
  )
    .filter((field, index, all) => all.indexOf(field) === index)
    .filter(isVisionReadable)
    .filter((field) => !isKnown(conversation.fields[field]));
}
