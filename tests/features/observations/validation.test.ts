import {
  emptyObservationDraft,
  type ObservationDraft,
} from '../../../features/observations/domain/observation';
import {
  MAX_INSTALLATION_YEAR,
  MIN_INSTALLATION_YEAR,
  validateObservationDraft,
  type ValidationCode,
} from '../../../features/observations/domain/validation';

const TODAY = '2026-09-09';

/** A draft that satisfies every rule, so each test can break exactly one. */
function validDraft(overrides: Partial<ObservationDraft> = {}): ObservationDraft {
  return {
    ...emptyObservationDraft(),
    siteId: 'site-1',
    visitDate: '2026-09-08',
    brand: 'Philips',
    ...overrides,
  };
}

function codes(draft: ObservationDraft, today = TODAY): ValidationCode[] {
  const result = validateObservationDraft(draft, today);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe('validateObservationDraft', () => {
  it('accepts a minimal valid draft', () => {
    const result = validateObservationDraft(validDraft(), TODAY);
    expect(result.ok).toBe(true);
  });

  it('requires a site', () => {
    expect(codes(validDraft({ siteId: null }))).toContain('site_required');
  });

  it('rejects a whitespace-only site id', () => {
    expect(codes(validDraft({ siteId: '   ' }))).toContain('site_required');
  });

  it('requires a visit date', () => {
    expect(codes(validDraft({ visitDate: null }))).toContain(
      'visit_date_required'
    );
  });

  it('rejects a malformed visit date', () => {
    expect(codes(validDraft({ visitDate: '09/09/2026' }))).toContain(
      'visit_date_malformed'
    );
  });

  it('rejects an impossible calendar date', () => {
    expect(codes(validDraft({ visitDate: '2026-13-45' }))).toContain(
      'visit_date_malformed'
    );
  });

  it('accepts a visit date of today', () => {
    expect(codes(validDraft({ visitDate: TODAY }))).toEqual([]);
  });

  it('rejects a visit date in the future', () => {
    expect(codes(validDraft({ visitDate: '2026-09-10' }))).toContain(
      'visit_date_in_future'
    );
  });

  describe('identifying attributes', () => {
    it('rejects a draft with no brand, model or modality', () => {
      expect(
        codes(validDraft({ brand: null, model: null, modality: null }))
      ).toContain('identifying_attribute_required');
    });

    it.each(['brand', 'model', 'modality'] as const)(
      'accepts a draft identified only by %s',
      (attribute) => {
        const draft = validDraft({ brand: null });
        draft[attribute] = 'value';
        expect(codes(draft)).toEqual([]);
      }
    );

    it('treats whitespace as absent', () => {
      expect(
        codes(validDraft({ brand: '  ', model: '', modality: null }))
      ).toContain('identifying_attribute_required');
    });
  });

  describe('quantity', () => {
    it('accepts a positive integer', () => {
      expect(codes(validDraft({ quantity: 5 }))).toEqual([]);
    });

    it('accepts an absent quantity', () => {
      expect(codes(validDraft({ quantity: null }))).toEqual([]);
    });

    it('rejects zero', () => {
      expect(codes(validDraft({ quantity: 0 }))).toContain(
        'quantity_not_positive'
      );
    });

    it('rejects a negative quantity', () => {
      expect(codes(validDraft({ quantity: -2 }))).toContain(
        'quantity_not_positive'
      );
    });

    it('rejects a fractional quantity', () => {
      expect(codes(validDraft({ quantity: 2.5 }))).toContain(
        'quantity_not_integer'
      );
    });

    it('rejects an unparseable quantity as a non-integer', () => {
      expect(codes(validDraft({ quantity: Number.NaN }))).toContain(
        'quantity_not_integer'
      );
    });
  });

  describe('years of use', () => {
    it('accepts zero', () => {
      expect(codes(validDraft({ estimatedYearsOfUse: 0 }))).toEqual([]);
    });

    it('rejects a negative value', () => {
      expect(codes(validDraft({ estimatedYearsOfUse: -1 }))).toContain(
        'years_of_use_negative'
      );
    });
  });

  describe('installation year', () => {
    it('accepts the boundary years allowed by the database CHECK', () => {
      expect(
        codes(validDraft({ estimatedInstallationYear: MIN_INSTALLATION_YEAR }))
      ).toEqual([]);
      expect(
        codes(validDraft({ estimatedInstallationYear: MAX_INSTALLATION_YEAR }))
      ).toEqual([]);
    });

    it('rejects a year below the range the database accepts', () => {
      expect(
        codes(validDraft({ estimatedInstallationYear: 1899 }))
      ).toContain('installation_year_out_of_range');
    });

    it('rejects a year above the range the database accepts', () => {
      expect(
        codes(validDraft({ estimatedInstallationYear: 2101 }))
      ).toContain('installation_year_out_of_range');
    });

    it('reports the allowed range so the message can state it', () => {
      const result = validateObservationDraft(
        validDraft({ estimatedInstallationYear: 1500 }),
        TODAY
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      const issue = result.issues.find(
        (candidate) => candidate.code === 'installation_year_out_of_range'
      );
      expect(issue?.params).toEqual({
        min: MIN_INSTALLATION_YEAR,
        max: MAX_INSTALLATION_YEAR,
      });
    });
  });

  describe('confidence without a value', () => {
    it('rejects confidence for an attribute that was left blank', () => {
      expect(
        codes(
          validDraft({
            model: null,
            attributeConfidence: { model: 'high' },
          })
        )
      ).toContain('confidence_without_value');
    });

    it('accepts confidence for an attribute that was filled in', () => {
      expect(
        codes(
          validDraft({ brand: 'Philips', attributeConfidence: { brand: 'high' } })
        )
      ).toEqual([]);
    });

    it('rejects confidence on installation year when the year is absent', () => {
      expect(
        codes(
          validDraft({
            estimatedInstallationYear: null,
            attributeConfidence: { installation_year: 'low' },
          })
        )
      ).toContain('confidence_without_value');
    });
  });

  it('reports every problem at once rather than stopping at the first', () => {
    const reported = codes(
      validDraft({ siteId: null, visitDate: null, brand: null, quantity: 0 })
    );
    expect(reported).toEqual(
      expect.arrayContaining([
        'site_required',
        'visit_date_required',
        'identifying_attribute_required',
        'quantity_not_positive',
      ])
    );
  });
});

test('rejects calendar dates JavaScript would silently normalize', () => {
  const draft = { ...emptyObservationDraft(), siteId: 'site', brand: 'Marca', visitDate: '2026-02-30' };
  const result = validateObservationDraft(draft, '2026-09-09');
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issues).toContainEqual({ field: 'visitDate', code: 'visit_date_malformed' });
});
