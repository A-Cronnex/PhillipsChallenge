import {
  normalizeExtraction,
  parseExtraction,
} from '../../../features/conversations/domain/extraction';

/**
 * CLAUDE.md §7: model output is never trusted. These tests are the proof.
 */
describe('parseExtraction', () => {
  const valid = {
    values: [
      { field: 'brand', value: 'Philips', status: 'confirmed', confidence: 'high' },
    ],
    followUpQuestion: '¿Cuántos equipos hay?',
  };

  it('accepts a well-formed payload', () => {
    const result = parseExtraction(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.values).toHaveLength(1);
    expect(result.extraction.followUpQuestion).toBe('¿Cuántos equipos hay?');
  });

  it.each([null, undefined, 'text', 42, []])(
    'rejects a payload that is not an object: %p',
    (payload) => {
      expect(parseExtraction(payload).ok).toBe(false);
    }
  );

  it('rejects a payload with no values array', () => {
    expect(parseExtraction({ followUpQuestion: 'hola' }).ok).toBe(false);
  });

  it('drops an invented field name and reports it', () => {
    const result = parseExtraction({
      values: [
        { field: 'serialNumber', value: 'X', status: 'confirmed', confidence: 'high' },
        ...valid.values,
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.values.map((v) => v.field)).toEqual(['brand']);
    expect(result.rejected[0]).toMatchObject({
      code: 'unknown_field',
      detail: 'serialNumber',
    });
  });

  it('drops an invalid status rather than coercing it', () => {
    const result = parseExtraction({
      values: [{ field: 'brand', value: 'Philips', status: 'verified', confidence: 'high' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.values).toHaveLength(0);
    expect(result.rejected[0].code).toBe('invalid_status');
  });

  it('drops an invalid confidence level', () => {
    const result = parseExtraction({
      values: [{ field: 'brand', value: 'Philips', status: 'confirmed', confidence: 'very high' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.values).toHaveLength(0);
    expect(result.rejected[0].code).toBe('invalid_confidence');
  });

  it('rejects a non-primitive value', () => {
    const result = parseExtraction({
      values: [{ field: 'brand', value: { name: 'Philips' }, status: 'confirmed', confidence: 'high' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.values).toHaveLength(0);
    expect(result.rejected[0].code).toBe('invalid_value_type');
  });

  it('rejects NaN, which JSON.parse can yield through a bad number literal', () => {
    const result = parseExtraction({
      values: [{ field: 'quantity', value: Number.NaN, status: 'reported', confidence: 'low' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.values).toHaveLength(0);
  });

  it('keeps the good entries when one entry is bad', () => {
    const result = parseExtraction({
      values: [
        { field: 'brand', value: 'Philips', status: 'confirmed', confidence: 'high' },
        { field: 'nope', value: 1, status: 'confirmed', confidence: 'high' },
        { field: 'modality', value: 'Monitor', status: 'reported', confidence: 'medium' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.values.map((v) => v.field)).toEqual(['brand', 'modality']);
    expect(result.rejected).toHaveLength(1);
  });

  it('treats an empty follow-up question as absent', () => {
    const result = parseExtraction({ values: [], followUpQuestion: '   ' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.followUpQuestion).toBeNull();
  });
});

describe('normalizeExtraction', () => {
  it('discards a value the model reported while calling it unknown', () => {
    // docs/ai-agent.md §5: an unknown value is stored as unknown, not invented.
    const normalized = normalizeExtraction({
      values: [
        { field: 'brand', value: 'maybe Philips?', status: 'unknown', confidence: 'low' },
      ],
      followUpQuestion: null,
    });

    expect(normalized.values[0].value).toBeNull();
    expect(normalized.values[0].status).toBe('unknown');
  });

  it('leaves known values untouched', () => {
    const normalized = normalizeExtraction({
      values: [
        { field: 'brand', value: 'Philips', status: 'confirmed', confidence: 'high' },
      ],
      followUpQuestion: null,
    });

    expect(normalized.values[0].value).toBe('Philips');
  });
});
