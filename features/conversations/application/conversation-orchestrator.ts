/**
 * Orchestrates a capture conversation (docs/ai-agent.md §3 and §3a).
 *
 * Responsibilities kept deliberately narrow: call the runtime, validate what
 * comes back, fold the valid parts into the conversation, and decide what the
 * agent asks next. It never writes to the database and never renders anything.
 *
 * The agent proposes; the application validates and decides (CLAUDE.md §7).
 */
import type { CaptureSource } from '../../../types/domain';
import {
  addTurn,
  recordField,
  recordPhotoRequest,
  recordVoiceSuggestion,
  withDerivedStatus,
  isKnown,
  missingRequiredFields,
  type ConversationState,
} from '../domain/conversation';
import {
  normalizeExtraction,
  parseExtraction,
  type AgentIssue,
  type ExtractionIssue,
} from '../domain/extraction';
import { capConfidenceByStatus } from '../domain/confidence';
import { preserveUserLanguage } from '../domain/language';
import { validateExtractedValues } from '../domain/value-rules';
import { CAPTURE_FIELDS, labelOf, type CaptureField } from '../domain/fields';
import {
  decideNextAction,
  visionTargetsFor,
  type NextAction,
} from '../domain/vision-flow';
import type { AiRuntime, UserLanguage } from './ports';
import { validateNameplateEdits, type NameplateProposal } from './nameplate-review';
import type { ExtractedValue } from '../domain/extraction';

export interface TurnResult {
  conversation: ConversationState;
  action: NextAction;
  /** What the agent says next, in the user's language. */
  message: string;
  /**
   * A recap of every field known so far, e.g. "Hasta ahora registré —
   * la marca: Philips." Null once nothing is known yet. Kept separate from
   * `message` so the UI can render it as a small indicator above the agent's
   * bubble rather than as part of what the agent "says" (product requirement,
   * 2026-09-10).
   */
  capturedSummary: string | null;
  /**
   * Everything the application refused to take from the model, or rewrote:
   * schema violations, values outside the business rules (docs/ai-agent.md
   * §8), and free text that was not the user's own words
   * (docs/tech-stack.md §7.2). Surfaced, never silently dropped.
   */
  rejected: AgentIssue[];
}

export type TurnOutcome =
  | { status: 'ok'; result: TurnResult }
  | { status: 'inference_failed'; conversation: ConversationState; reason: string }
  | { status: 'unusable_output'; conversation: ConversationState; issues: ExtractionIssue[] };

export interface OrchestratorDeps {
  runtime: AiRuntime;
  now: () => Date;
  language: UserLanguage;
  checkpoint?: (state: ConversationState) => Promise<void>;
  onResponding?: () => void;
}

/** Wording for each action. Spanish is the confirmed scope (tech-stack §7.2). */
export function messageFor(action: NextAction): string {
  switch (action.type) {
    case 'ask_photo':
      return `¿Puedes tomar una foto de la placa del equipo donde se vea ${labelOf(
        action.field
      )}?`;
    case 'suggest_voice':
      return `No logré leer ${labelOf(
        action.field
      )} en la foto. ¿Prefieres decírmelo por voz? También puedes intentar con otra foto si quieres.`;
    case 'ask_field':
      return `¿Cuál es ${labelOf(action.field)}?`;
    case 'confirm':
      return 'Tengo todo lo necesario. ¿Confirmas que guardo esta observación?';
  }
}

/**
 * Recaps every field known so far, so the user can see exactly what the agent
 * captured from them without having to scroll back through the conversation
 * (product requirement, 2026-09-10). Built from domain state alone — never
 * from the model's own words — so it is exact and testable without a model.
 */
function summarizeCaptured(conversation: ConversationState): string | null {
  const known = CAPTURE_FIELDS.filter((field) => isKnown(conversation.fields[field]));
  if (!known.length) return null;
  const parts = known.map(
    (field) => `${labelOf(field)}: ${conversation.fields[field].value}`
  );
  return `Hasta ahora registré — ${parts.join('; ')}.`;
}

/**
 * Names every still-missing required field, not just the one the next
 * question targets — city, country and the site name are mandatory
 * (product requirement, 2026-09-10), and the user should see all of what is
 * outstanding, not discover it one field at a time.
 */
function summarizeMissing(conversation: ConversationState): string | null {
  const missing = missingRequiredFields(conversation);
  if (!missing.length) return null;
  return `Todavía necesito: ${missing.map(labelOf).join(', ')}.`;
}

/**
 * Composes what the agent says this turn: a reminder of what is still
 * missing, then the deterministic question for `action`. Built entirely from
 * domain state — MedPsy no longer proposes the follow-up text itself; its
 * questions were free-form model output the application could not validate
 * before showing it to the user (CLAUDE.md §7), and asking a question outside
 * what the schema already tracks produced incoherent results (docs/ai-agent.md
 * §7 no longer has a `followUpQuestion` field; see `extraction.ts`).
 */
function composeMessage(conversation: ConversationState, action: NextAction): string {
  return [summarizeMissing(conversation), messageFor(action)]
    .filter((part): part is string => part !== null)
    .join(' ');
}

/**
 * Applies a validated extraction to the conversation.
 *
 * Exported for testing: this is where model output becomes domain state, and
 * it must be verifiable without running a model.
 */
export function applyExtraction(
  conversation: ConversationState,
  extraction: ReturnType<typeof normalizeExtraction>,
  source: CaptureSource
): ConversationState {
  let next = conversation;
  for (const value of extraction.values) {
    if (value.value === null) continue;
    next = recordField(next, value.field, {
      value: value.value,
      status: value.status,
      // docs/ai-agent.md §9: confidence is stored per attribute, but the
      // model's own claim is checked against the status it gave alongside it
      // before it becomes domain state (CLAUDE.md §7).
      confidence: capConfidenceByStatus(value.status, value.confidence),
      source,
    });
  }
  return next;
}

async function runExtraction(
  conversation: ConversationState,
  source: CaptureSource,
  deps: OrchestratorDeps,
  call: () => Promise<unknown>
): Promise<TurnOutcome> {
  let raw: unknown;
  try {
    raw = await call();
  } catch (error) {
    // docs/ai-agent.md §13: preserve the input, inform the user, allow retry,
    // fabricate nothing. The conversation keeps every turn recorded so far.
    return {
      status: 'inference_failed',
      conversation: { ...conversation, lastError: describe(error) },
      reason: describe(error),
    };
  }

  const parsed = parseExtraction(raw);
  if (!parsed.ok) {
    return {
      status: 'unusable_output',
      conversation: { ...conversation, lastError: 'invalid model output' },
      issues: parsed.issues,
    };
  }

  const extraction = normalizeExtraction(parsed.extraction);

  // docs/ai-agent.md §8 — schema-legal is not the same as legal. Numeric
  // ranges, geographic values and text limits are checked before any value
  // becomes domain state.
  const checked = validateExtractedValues(extraction.values);

  // docs/tech-stack.md §7.2 — free text is persisted in the user's own
  // language, never in the English MedPsy reasons in. The turn just added is
  // the user's, so its text is what the values are checked against.
  const utterance = conversation.turns[conversation.turns.length - 1] ?? null;
  const guarded = preserveUserLanguage(checked.values, {
    source,
    utterance: utterance?.role === 'user' ? utterance.text : null,
    pendingField: conversation.pendingField,
  });

  let next = applyExtraction(
    conversation,
    { ...extraction, values: guarded.values },
    source
  );
  next = { ...next, lastError: null, pendingField: null };

  const hadPhoto = next.turns.some((turn) => turn.source === 'image');
  const action = decideNextAction(next, { hadPhoto });

  next = applyAction(next, action);

  return {
    status: 'ok',
    result: {
      conversation: withDerivedStatus(next),
      action,
      message: composeMessage(next, action),
      capturedSummary: summarizeCaptured(next),
      rejected: [...parsed.rejected, ...checked.issues, ...guarded.issues],
    },
  };
}

/** Records the bookkeeping each action implies (§3a rule 1's counters). */
function applyAction(
  conversation: ConversationState,
  action: NextAction
): ConversationState {
  switch (action.type) {
    case 'ask_photo':
      return recordPhotoRequest(conversation, action.field);
    case 'suggest_voice':
      return recordVoiceSuggestion(conversation, action.field);
    case 'ask_field':
      return {
        ...conversation,
        pendingField: action.field,
        status: 'awaiting_clarification',
      };
    case 'confirm':
      return { ...conversation, pendingField: null };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The user provided a photo (docs/ai-agent.md §3a, entry point of the flow). */
export async function submitPhoto(
  conversation: ConversationState,
  imagePath: string,
  deps: OrchestratorDeps
): Promise<TurnOutcome> {
  const targets = visionTargetsFor(conversation);
  const withTurn = addTurn(conversation, {
    role: 'user',
    text: '[foto]',
    source: 'image',
    reference: imagePath,
    at: deps.now().toISOString(),
  });

  await deps.checkpoint?.(withTurn);
  return runExtraction(withTurn, 'image', deps, () =>
    deps.runtime.extractFromImage({
      imagePath,
      targetFields: targets,
      language: deps.language,
    })
  );
}

/** The user typed something. */
export async function submitText(
  conversation: ConversationState,
  text: string,
  deps: OrchestratorDeps
): Promise<TurnOutcome> {
  const targets = pendingTargets(conversation);
  const withTurn = addTurn(conversation, {
    role: 'user',
    text,
    source: 'text',
    at: deps.now().toISOString(),
  });

  await deps.checkpoint?.(withTurn);
  return runExtraction(withTurn, 'text', deps, () =>
    deps.runtime.extractFromText({
      text,
      language: deps.language,
      targetFields: targets,
      onResponding: deps.onResponding,
    })
  );
}

/**
 * The user spoke. Transcription happens first, then the same text path.
 *
 * The transcript is kept as the turn's text so the conversation record shows
 * what the user actually said, in their own language (docs/tech-stack.md §7.2).
 */
export async function submitVoice(
  conversation: ConversationState,
  audioPath: string,
  deps: OrchestratorDeps
): Promise<TurnOutcome> {
  const lastVoice = conversation.turns[conversation.turns.length - 1];
  const pendingVoice = lastVoice?.source === 'voice' && lastVoice.reference === audioPath
    && lastVoice.text === '[audio pendiente de transcripción]' ? conversation : addTurn(conversation, { role: 'user', text: '[audio pendiente de transcripción]',
    source: 'voice', reference: audioPath, at: deps.now().toISOString() });
  await deps.checkpoint?.(pendingVoice);
  let transcript: string;
  try {
    transcript = await deps.runtime.transcribe(audioPath);
  } catch (error) {
    return {
      status: 'inference_failed',
      conversation: { ...pendingVoice, lastError: describe(error) },
      reason: describe(error),
    };
  }

  return submitVoiceTranscript(pendingVoice, transcript, audioPath, deps);
}

/** A completed streaming transcript follows the voice path without transcribing twice. */
export async function submitVoiceTranscript(conversation: ConversationState, text: string, audioPath: string, deps: OrchestratorDeps): Promise<TurnOutcome> {
  if (!text.trim()) throw new Error('No se detectó voz.');
  const last = conversation.turns[conversation.turns.length - 1];
  if (last?.source === 'voice' && last.reference === audioPath && last.text === '[audio pendiente de transcripción]') {
    conversation = { ...conversation, turns: conversation.turns.slice(0, -1) };
  }
  const withTurn = addTurn(conversation, { role: 'user', text, source: 'voice', reference: audioPath, at: deps.now().toISOString() });
  await deps.checkpoint?.(withTurn);
  return runExtraction(withTurn, 'voice', deps, () => deps.runtime.extractFromText({ text, language: deps.language, targetFields: pendingTargets(conversation),
    onResponding: deps.onResponding }));
}

/** Human approval is the only entry point for a staged photo into the chat. */
export async function submitReviewedPhoto(conversation: ConversationState, proposal: NameplateProposal, edits: ExtractedValue[], deps: OrchestratorDeps): Promise<TurnOutcome> {
  const values = validateNameplateEdits(proposal, edits);
  const text = 'Placa revisada: ' + values.filter(value => value.value !== null).map(value => `${labelOf(value.field)}: ${value.value}`).join('; ');
  const last = conversation.turns[conversation.turns.length - 1];
  const withTurn = last?.role === 'user' && last.reference === proposal.imagePath && last.text === text ? conversation
    : addTurn(conversation, { role: 'user', text, source: 'image', reference: proposal.imagePath, at: deps.now().toISOString() });
  await deps.checkpoint?.(withTurn);
  const outcome = await runExtraction(withTurn, 'image', deps, async () => ({ values }));
  if (outcome.status === 'ok') {
    outcome.result.conversation = { ...outcome.result.conversation, pendingImagePath: null };
    for (const value of values) {
      const original = proposal.values.find(item => item.field === value.field);
      const applied = outcome.result.conversation.fields[value.field];
      if (value.value !== null && original?.value !== value.value && applied.value === value.value && applied.source === 'image') {
        outcome.result.conversation = { ...outcome.result.conversation, fields: { ...outcome.result.conversation.fields,
          [value.field]: { ...applied, source: 'text', status: 'reported' } } };
      }
    }
    outcome.result.rejected.push(...proposal.rejected);
  }
  return outcome;
}

/**
 * Every field still unknown, not just `pendingField` — a reply can answer
 * more than the one thing the agent last asked about (e.g. "la marca es
 * Philips y el modelo es X" while only brand was pending), so the model is
 * always asked for everything missing rather than narrowed to one field
 * (product requirement, 2026-09-10).
 */
function pendingTargets(conversation: ConversationState): CaptureField[] {
  return Object.values(conversation.fields).filter(state => !isKnown(state)).map(state => state.field);
}
