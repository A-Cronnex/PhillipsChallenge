/**
 * docs/tech-stack.md §7.2 and docs/domain-model.md §6 — free text is stored in
 * the user's own language, never in the English MedPsy reasons in.
 *
 * The cases below are written the way the failure actually shows up in the
 * field: the user speaks Spanish, the model answers in English, and something
 * has to stop that English reaching the database.
 */
import type { ExtractedValue } from '../../../features/conversations/domain/extraction';
import {
  MAX_DIRECT_ANSWER_LENGTH,
  findOriginalSpan,
  foldForComparison,
  preserveUserLanguage,
} from '../../../features/conversations/domain/language';

const value = (
  field: ExtractedValue['field'],
  raw: string
): ExtractedValue => ({
  field,
  value: raw,
  status: 'reported',
  confidence: 'medium',
});

const fromText = (utterance: string, pendingField = null as null | ExtractedValue['field']) =>
  ({ source: 'text' as const, utterance, pendingField });

describe('foldForComparison / findOriginalSpan', () => {
  it('matches ignoring accents, case and punctuation', () => {
    expect(foldForComparison('Ciudad de Panamá')).toBe('ciudad de panama');
    expect(
      findOriginalSpan('Estamos en Ciudad de Panamá.', 'ciudad de panama')
    ).toBe('Ciudad de Panamá');
  });

  it('returns the user’s spelling, not the model’s echo of it', () => {
    // The model dropped the accent; what gets stored is what the user wrote.
    expect(findOriginalSpan('El Hospital Santo Tomás', 'Hospital Santo Tomas')).toBe(
      'Hospital Santo Tomás'
    );
  });

  it('returns null when the text is not in the utterance at all', () => {
    expect(findOriginalSpan('Ciudad de Panamá', 'Panama City')).toBeNull();
  });

  it('returns null for an empty needle rather than matching everything', () => {
    expect(findOriginalSpan('lo que sea', '   ')).toBeNull();
  });
});

describe('preserveUserLanguage — text and voice turns', () => {
  it('drops a translated city instead of storing the English the model returned', () => {
    const outcome = preserveUserLanguage(
      [value('city', 'Panama City')],
      fromText('Estoy en Ciudad de Panamá con cinco monitores')
    );

    expect(outcome.values).toHaveLength(0);
    expect(outcome.issues).toEqual([
      {
        path: '$.values.city',
        code: 'free_text_not_in_user_language',
        detail: 'Panama City',
      },
    ]);
  });

  it('keeps a value the user really did say, respelled as they wrote it', () => {
    const outcome = preserveUserLanguage(
      [value('city', 'ciudad de panama')],
      fromText('Estoy en Ciudad de Panamá')
    );

    expect(outcome.values[0].value).toBe('Ciudad de Panamá');
    expect(outcome.issues).toEqual([]);
  });

  it('falls back to the user’s original statement for notes (§6)', () => {
    const utterance =
      'Uno de los monitores está fuera de servicio desde la semana pasada';
    const outcome = preserveUserLanguage(
      [value('notes', 'One monitor has been out of service since last week')],
      fromText(utterance)
    );

    expect(outcome.values[0].value).toBe(utterance);
    expect(outcome.issues[0].code).toBe('free_text_replaced_with_original');
  });

  it('takes a short reply as the answer to the field the agent just asked about', () => {
    const outcome = preserveUserLanguage(
      [value('modality', 'X-Ray')],
      fromText('rayos X', 'modality')
    );

    expect(outcome.values[0].value).toBe('rayos X');
    expect(outcome.values[0].status).toBe('reported');
    expect(outcome.issues[0].code).toBe('free_text_replaced_with_original');
  });

  it('does not turn a long sentence into the value of a one-line field', () => {
    const long = 'a'.repeat(MAX_DIRECT_ANSWER_LENGTH + 1);
    const outcome = preserveUserLanguage(
      [value('modality', 'X-Ray')],
      fromText(long, 'modality')
    );

    expect(outcome.values).toHaveLength(0);
    expect(outcome.issues[0].code).toBe('free_text_not_in_user_language');
  });

  it('leaves brand and model alone — a manufacturer name is not translated', () => {
    const outcome = preserveUserLanguage(
      [value('brand', 'Philips'), value('model', 'IntelliVue MX450')],
      fromText('son equipos de la marca que ya sabes')
    );

    expect(outcome.values.map((entry) => entry.value)).toEqual([
      'Philips',
      'IntelliVue MX450',
    ]);
    expect(outcome.issues).toEqual([]);
  });

  it('leaves numeric values alone — a number has no language', () => {
    const outcome = preserveUserLanguage(
      [{ field: 'quantity', value: 5, status: 'reported', confidence: 'high' }],
      fromText('tenemos cinco monitores')
    );

    expect(outcome.values[0].value).toBe(5);
    expect(outcome.issues).toEqual([]);
  });
});

describe('preserveUserLanguage — turns with nothing to compare against', () => {
  it('does not touch values read from a photo', () => {
    const outcome = preserveUserLanguage([value('notes', 'Out of service')], {
      source: 'image',
      utterance: null,
      pendingField: null,
    });

    expect(outcome.values[0].value).toBe('Out of service');
    expect(outcome.issues).toEqual([]);
  });

  it('does not drop values when there is no utterance to verify against', () => {
    const outcome = preserveUserLanguage([value('city', 'Panama City')], {
      source: 'text',
      utterance: '   ',
      pendingField: null,
    });

    expect(outcome.values).toHaveLength(1);
    expect(outcome.issues).toEqual([]);
  });
});
