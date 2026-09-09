import {
  emptyFormValues,
  setConfidence,
  toDraft,
} from '../../../features/observations/ui/form-mapping';

describe('toDraft', () => {
  it('maps blank strings to null rather than empty values', () => {
    const draft = toDraft(emptyFormValues());

    expect(draft.brand).toBeNull();
    expect(draft.notes).toBeNull();
    expect(draft.visitDate).toBeNull();
  });

  it('maps a blank numeric field to null, not zero', () => {
    const draft = toDraft(emptyFormValues({ quantity: '' }));
    expect(draft.quantity).toBeNull();
  });

  it('parses a numeric field', () => {
    const draft = toDraft(emptyFormValues({ quantity: '5' }));
    expect(draft.quantity).toBe(5);
  });

  it('passes an unparseable number through as NaN so validation can report it', () => {
    const draft = toDraft(emptyFormValues({ quantity: 'cinco' }));
    expect(Number.isNaN(draft.quantity)).toBe(true);
  });

  it('preserves a fractional entry so validation can reject it', () => {
    const draft = toDraft(emptyFormValues({ quantity: '2.5' }));
    expect(draft.quantity).toBe(2.5);
  });

  it('never links equipment from manual capture', () => {
    const draft = toDraft(emptyFormValues({ brand: 'Philips' }));
    expect(draft.equipmentId).toBeNull();
  });
});

describe('setConfidence', () => {
  it('adds a confidence selection', () => {
    const next = setConfidence(emptyFormValues(), 'brand', 'high');
    expect(next.attributeConfidence).toEqual({ brand: 'high' });
  });

  it('removes the selection when cleared', () => {
    const withValue = setConfidence(emptyFormValues(), 'brand', 'high');
    const cleared = setConfidence(withValue, 'brand', undefined);
    expect(cleared.attributeConfidence).toEqual({});
  });

  it('does not mutate the previous values', () => {
    const values = emptyFormValues();
    setConfidence(values, 'brand', 'high');
    expect(values.attributeConfidence).toEqual({});
  });
});
