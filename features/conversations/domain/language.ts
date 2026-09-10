/**
 * Keeps free-text values in the user's own language
 * (docs/tech-stack.md §7.2, docs/ai-agent.md §12, docs/domain-model.md §6).
 *
 * The confirmed pipeline is `es → MedPsy(en) → es`: the English text is a
 * transient working copy and must never be what gets persisted. Two things
 * can put English into a field value anyway —
 *
 *   1. the Bergamot es→en bridge, once it is wired
 *      (docs/ai-agent-implementation.md §4), and
 *   2. MedPsy itself, which reasons in English and will happily answer
 *      `"Panama City"` when the user said "Ciudad de Panamá", bridge or no
 *      bridge.
 *
 * Prompting against it (services/ai/prompts.ts) is necessary but not
 * sufficient: a prompt is a request, and CLAUDE.md §7 says model output is
 * never trusted. So for language-sensitive fields the rule is enforced here,
 * in the domain, and it is deliberately mechanical rather than clever: the
 * value must be **the user's own words**, found in what the user actually
 * said this turn.
 *
 * There is no offline language detector in this project and none is being
 * invented. "Is this Spanish?" is replaced by "did the user write this?",
 * which is decidable, deterministic, and testable without a device.
 *
 * Scope: text and voice turns only. A photo has no user utterance to compare
 * against — what a nameplate says is what it says — so image-sourced values
 * pass through untouched.
 */
import type { CaptureSource } from '../../../types/domain';
import type { AgentIssue, ExtractedValue } from './extraction';
import { isLanguageSensitive, type CaptureField } from './fields';

export type LanguageRuleCode =
  | 'free_text_not_in_user_language'
  | 'free_text_replaced_with_original';

export type LanguageIssue = AgentIssue<LanguageRuleCode>;

/**
 * Length below which a user turn is treated as a direct answer to the question
 * the agent just asked, and can therefore stand in as the value itself.
 *
 * PROPOSED — pending confirmation. It exists to stop a paragraph becoming the
 * value of a one-line field: if the agent asked "¿Cuál es la modalidad?" and
 * the user replied "rayos X", their reply *is* the answer, in their language.
 * If they replied with three sentences, it is not.
 */
export const MAX_DIRECT_ANSWER_LENGTH = 60;

interface IndexedText {
  text: string;
  /** Start offset in the source string of each normalized character. */
  start: number[];
  /** End offset (exclusive) in the source string of each normalized character. */
  end: number[];
}

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Folds text for comparison: accents removed, lower-cased, punctuation and
 * runs of whitespace reduced to single spaces, while remembering where each
 * surviving character came from.
 *
 * Accent folding is what makes the check usable in practice — a model that
 * echoes the user's words often drops the accents ("Panama" for "Panamá"),
 * and that is still the user's word, not a translation.
 */
function indexNormalized(source: string): IndexedText {
  const chars: string[] = [];
  const start: number[] = [];
  const end: number[] = [];
  let offset = 0;
  let pendingSeparator = false;

  for (const character of source) {
    const from = offset;
    offset += character.length;

    const folded = character
      .normalize('NFD')
      .replace(COMBINING_MARKS, '')
      .toLowerCase();

    if (folded.length === 0) continue;

    if (LETTER_OR_DIGIT.test(folded)) {
      if (pendingSeparator && chars.length > 0) {
        chars.push(' ');
        start.push(from);
        end.push(from);
      }
      pendingSeparator = false;
      for (const piece of folded) {
        chars.push(piece);
        start.push(from);
        end.push(offset);
      }
    } else {
      pendingSeparator = true;
    }
  }

  return { text: chars.join(''), start, end };
}

/** The comparison form of a string, without the position bookkeeping. */
export function foldForComparison(value: string): string {
  return indexNormalized(value).text;
}

/**
 * Returns the span of `source` that matches `value`, spelled the way the user
 * spelled it, or null when `value` does not appear in `source` at all.
 *
 * Returning the *original* span rather than the model's echo is the point: it
 * restores the accents and capitalisation the model may have dropped, so what
 * is persisted is character-for-character what the user wrote.
 */
export function findOriginalSpan(
  source: string,
  value: string
): string | null {
  const needle = foldForComparison(value);
  if (needle.length === 0) return null;

  const haystack = indexNormalized(source);
  const at = haystack.text.indexOf(needle);
  if (at === -1) return null;

  return source.slice(haystack.start[at], haystack.end[at + needle.length - 1]);
}

export interface PreserveLanguageOptions {
  /** How this turn was captured. Only `text` and `voice` are checked. */
  source: CaptureSource;
  /** What the user said or typed this turn, in their own language. */
  utterance: string | null;
  /** The field the agent had just asked about, if any. */
  pendingField: CaptureField | null;
}

export interface PreserveLanguageOutcome {
  values: ExtractedValue[];
  issues: LanguageIssue[];
}

/**
 * Rewrites language-sensitive values to the user's own wording, or drops them.
 *
 * For each language-sensitive text value from a text/voice turn:
 *
 * - found in the utterance → replaced by the user's own spelling of it;
 * - not found, and the field is `notes` → replaced by the utterance itself.
 *   docs/ai-agent.md §6 says to preserve the original user statement, and
 *   losing the note entirely would be worse than storing more of it than the
 *   model would have;
 * - not found, and the field is the one the agent just asked about, and the
 *   reply is short enough to be a direct answer → replaced by the reply;
 * - otherwise → dropped and reported. The field stays missing and the agent
 *   asks again, which is the outcome §5 prescribes: never invent, and here,
 *   never persist a translation of what the user said.
 *
 * Status and confidence are left alone. This rule is about which words are
 * stored, not about how well established the fact is.
 */
export function preserveUserLanguage(
  values: ExtractedValue[],
  options: PreserveLanguageOptions
): PreserveLanguageOutcome {
  const issues: LanguageIssue[] = [];

  if (options.source === 'image') {
    return { values, issues };
  }

  const utterance = options.utterance?.trim() ?? '';
  if (utterance.length === 0) {
    // Nothing to check against. Leaving the values untouched is the honest
    // behaviour: this function verifies authorship, and with no utterance
    // there is nothing to verify either way.
    return { values, issues };
  }

  const kept: ExtractedValue[] = [];

  for (const entry of values) {
    if (
      entry.value === null ||
      typeof entry.value !== 'string' ||
      !isLanguageSensitive(entry.field)
    ) {
      kept.push(entry);
      continue;
    }

    const span = findOriginalSpan(utterance, entry.value);
    if (span !== null) {
      kept.push({ ...entry, value: span });
      continue;
    }

    const isDirectAnswer =
      entry.field === options.pendingField &&
      utterance.length <= MAX_DIRECT_ANSWER_LENGTH;

    if (entry.field === 'notes' || isDirectAnswer) {
      kept.push({ ...entry, value: utterance });
      issues.push({
        path: `$.values.${entry.field}`,
        code: 'free_text_replaced_with_original',
      });
      continue;
    }

    issues.push({
      path: `$.values.${entry.field}`,
      code: 'free_text_not_in_user_language',
      detail: entry.value,
    });
  }

  return { values: kept, issues };
}
