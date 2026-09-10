/**
 * Prompt construction for MedPsy and VisionPsy.
 *
 * docs/ai-agent.md §12 lists the exact prompt/response contract as undecided.
 * What is fixed is the JSON shape (§7) and the rule that the model must not
 * invent values (§5). These prompts encode exactly that and nothing more.
 */
import type { UserLanguage } from '../../features/conversations/application/ports';
import {
  CAPTURE_FIELD_SPECS,
  LANGUAGE_SENSITIVE_FIELDS,
  type CaptureField,
} from '../../features/conversations/domain/fields';
import { EXTRACTION_JSON_SCHEMA } from '../../features/conversations/domain/extraction';

/** MedPsy is natively English (docs/tech-stack.md §7.2), so prompts are English. */
const RULES = [
  'Return ONLY JSON matching the schema. No prose, no code fences.',
  'Never invent a value. If a value is not present in the input, set "value" to null and "status" to "unknown".',
  'Use status "confirmed" only when the value is directly legible in the input.',
  'Use "reported" when the user stated it without verification.',
  'Use "estimated" when the value is approximate or inferred.',
  'Set "confidence" to how certain you are: high, medium or low.',
  'Do not mark an estimated value as high confidence.',
  'Numeric fields must be JSON numbers, never words: 5, not "five".',
  'Do not include fields that were not requested.',
].join('\n- ');

const LANGUAGE_NAMES: Record<UserLanguage, string> = {
  es: 'Spanish',
  en: 'English',
};

/**
 * docs/tech-stack.md §7.2: free-text values are persisted in the user's own
 * language, and the English MedPsy reasons in is a working copy that is never
 * stored. Asking for verbatim values is the cheap half of enforcing that; the
 * enforced half is `features/conversations/domain/language.ts`, which checks
 * the answer against what the user actually said, because a prompt is a
 * request and model output is never trusted (CLAUDE.md §7).
 */
function languageRules(language: UserLanguage): string {
  const name = LANGUAGE_NAMES[language];
  const fields = LANGUAGE_SENSITIVE_FIELDS.join(', ');
  return [
    `The user writes in ${name}. Reason in English if you need to, but never translate values.`,
    `For these fields copy the user's own ${name} words exactly as written, character for character: ${fields}.`,
    `Write "followUpQuestion" in ${name}, never in English.`,
  ].join('\n- ');
}

function fieldList(fields: CaptureField[]): string {
  return fields
    .map((field) => `  - ${field}: ${CAPTURE_FIELD_SPECS[field].label}`)
    .join('\n');
}

export function textExtractionPrompt(
  text: string,
  targetFields: CaptureField[],
  language: UserLanguage
): string {
  return [
    'You extract structured information about medical equipment installed in hospitals.',
    '',
    'Extract ONLY these fields:',
    fieldList(targetFields),
    '',
    `Rules:\n- ${RULES}`,
    `- ${languageRules(language)}`,
    '',
    'JSON schema:',
    JSON.stringify(EXTRACTION_JSON_SCHEMA),
    '',
    'Input:',
    text,
  ].join('\n');
}

export function imageExtractionPrompt(
  targetFields: CaptureField[],
  language: UserLanguage
): string {
  return [
    'You read nameplates and labels on medical equipment in photographs.',
    '',
    'Read ONLY these fields from the image:',
    fieldList(targetFields),
    '',
    'If a field is not legible in the image, set its "value" to null and "status" to "unknown".',
    'Do not guess a manufacturer or model from the equipment shape alone.',
    '',
    `Rules:\n- ${RULES}`,
    // A label reads the way it is printed; transcribe it, do not translate it
    // (docs/tech-stack.md §7.2).
    `- Transcribe text on the label exactly as printed. Write "followUpQuestion" in ${LANGUAGE_NAMES[language]}.`,
    '',
    'JSON schema:',
    JSON.stringify(EXTRACTION_JSON_SCHEMA),
  ].join('\n');
}

/**
 * Extracts the JSON object from a completion.
 *
 * Small models wrap JSON in prose or code fences even when told not to. This
 * recovers the object rather than failing the turn, and returns null when
 * there is genuinely nothing parseable — never a fabricated fallback.
 */
export function extractJsonPayload(raw: string): unknown | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
