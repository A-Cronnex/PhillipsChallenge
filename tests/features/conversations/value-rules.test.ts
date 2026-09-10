/**
 * docs/ai-agent.md §8 — business-rule validation of model output.
 *
 * These tests exist because the schema validator in `extraction.test.ts`
 * deliberately does not check values: a year of 3025 and a quantity of one
 * million are both perfectly well-formed JSON.
 */
import type { ExtractedValue } from '../../../features/conversations/domain/extraction';
import {
  MAX_LABEL_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_QUANTITY,
  MAX_YEARS_OF_USE,
  validateExtractedValue,
  validateExtractedValues,
} from '../../../features/conversations/domain/value-rules';
import {
  MAX_INSTALLATION_YEAR,
  MIN_INSTALLATION_YEAR,
} from '../../../features/observations/domain/validation';

const value = (
  field: ExtractedValue['field'],
  raw: ExtractedValue['value']
): ExtractedValue => ({
  field,
  value: raw,
  status: 'reported',
  confidence: 'medium',
});

describe('numeric ranges', () => {
  it('accepts a plausible quantity', () => {
    expect(validateExtractedValue('quantity', 5)).toEqual({
      ok: true,
      value: 5,
    });
  });

  it('rejects a quantity of zero, which the schema allows and the database does not', () => {
    expect(validateExtractedValue('quantity', 0)).toMatchObject({
      ok: false,
      code: 'out_of_range',
    });
  });

  it('rejects a hallucinated quantity above the proposed bound', () => {
    expect(validateExtractedValue('quantity', MAX_QUANTITY + 1)).toMatchObject({
      ok: false,
      code: 'out_of_range',
    });
  });

  it('rejects a fractional count', () => {
    expect(validateExtractedValue('quantity', 2.5)).toMatchObject({
      ok: false,
      code: 'not_an_integer',
    });
  });

  it('accepts an installation year inside the range migration 001 enforces', () => {
    expect(validateExtractedValue('estimatedInstallationYear', 2014)).toEqual({
      ok: true,
      value: 2014,
    });
    expect(
      validateExtractedValue('estimatedInstallationYear', MIN_INSTALLATION_YEAR)
    ).toEqual({ ok: true, value: MIN_INSTALLATION_YEAR });
  });

  it('rejects an installation year the database would refuse', () => {
    expect(
      validateExtractedValue(
        'estimatedInstallationYear',
        MAX_INSTALLATION_YEAR + 1
      )
    ).toMatchObject({ ok: false, code: 'out_of_range' });
    expect(
      validateExtractedValue('estimatedInstallationYear', 1899)
    ).toMatchObject({ ok: false, code: 'out_of_range' });
  });

  it('accepts zero years of use and rejects a negative or implausible one', () => {
    expect(validateExtractedValue('estimatedYearsOfUse', 0)).toEqual({
      ok: true,
      value: 0,
    });
    expect(validateExtractedValue('estimatedYearsOfUse', -1)).toMatchObject({
      ok: false,
      code: 'out_of_range',
    });
    expect(
      validateExtractedValue('estimatedYearsOfUse', MAX_YEARS_OF_USE + 1)
    ).toMatchObject({ ok: false, code: 'out_of_range' });
  });

  it('coerces a numeric string, which is what models actually return', () => {
    expect(validateExtractedValue('quantity', '5')).toEqual({
      ok: true,
      value: 5,
    });
  });

  it('does not try to interpret a number written as words or with units', () => {
    expect(validateExtractedValue('quantity', 'cinco')).toMatchObject({
      ok: false,
      code: 'not_a_number',
    });
    expect(validateExtractedValue('quantity', '5 equipos')).toMatchObject({
      ok: false,
      code: 'not_a_number',
    });
  });
});

describe('geographic values', () => {
  it('accepts a city name', () => {
    expect(validateExtractedValue('city', 'Ciudad de Panamá')).toEqual({
      ok: true,
      value: 'Ciudad de Panamá',
    });
  });

  it('rejects a place name containing digits', () => {
    expect(validateExtractedValue('city', '08015')).toMatchObject({
      ok: false,
      code: 'not_a_place_name',
    });
    expect(validateExtractedValue('country', 'Panama 2024')).toMatchObject({
      ok: false,
      code: 'not_a_place_name',
    });
  });

  it('allows digits in fields that are not place names', () => {
    expect(validateExtractedValue('model', 'IntelliVue MX450')).toEqual({
      ok: true,
      value: 'IntelliVue MX450',
    });
  });
});

describe('text values', () => {
  it('trims and rejects whitespace-only text', () => {
    expect(validateExtractedValue('brand', '  Philips  ')).toEqual({
      ok: true,
      value: 'Philips',
    });
    expect(validateExtractedValue('brand', '   ')).toMatchObject({
      ok: false,
      code: 'empty_text',
    });
  });

  it('rejects a label longer than the proposed limit', () => {
    expect(
      validateExtractedValue('brand', 'x'.repeat(MAX_LABEL_LENGTH + 1))
    ).toMatchObject({ ok: false, code: 'text_too_long' });
  });

  it('allows notes to be much longer than a label', () => {
    const long = 'x'.repeat(MAX_LABEL_LENGTH + 1);
    expect(validateExtractedValue('notes', long)).toEqual({
      ok: true,
      value: long,
    });
    expect(
      validateExtractedValue('notes', 'x'.repeat(MAX_NOTES_LENGTH + 1))
    ).toMatchObject({ ok: false, code: 'text_too_long' });
  });
});

describe('validateExtractedValues', () => {
  it('keeps the good values, reports the bad ones and invents nothing', () => {
    const outcome = validateExtractedValues([
      value('brand', 'Philips'),
      value('estimatedInstallationYear', 3025),
      value('quantity', 3),
    ]);

    expect(outcome.values.map((entry) => entry.field)).toEqual([
      'brand',
      'quantity',
    ]);
    expect(outcome.issues).toEqual([
      {
        path: '$.values.estimatedInstallationYear',
        code: 'out_of_range',
        detail: `${MIN_INSTALLATION_YEAR}..${MAX_INSTALLATION_YEAR}`,
      },
    ]);
  });

  it('passes null values through untouched — "not found" is a valid answer (§5)', () => {
    const outcome = validateExtractedValues([
      { field: 'brand', value: null, status: 'unknown', confidence: 'low' },
    ]);

    expect(outcome.values).toHaveLength(1);
    expect(outcome.values[0].value).toBeNull();
    expect(outcome.issues).toEqual([]);
  });

  it('preserves status and confidence while normalising the value', () => {
    const outcome = validateExtractedValues([
      { field: 'quantity', value: '7', status: 'estimated', confidence: 'low' },
    ]);

    expect(outcome.values[0]).toEqual({
      field: 'quantity',
      value: 7,
      status: 'estimated',
      confidence: 'low',
    });
  });
});
