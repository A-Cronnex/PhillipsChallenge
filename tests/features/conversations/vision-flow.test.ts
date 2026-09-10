import {
  recordField,
  recordPhotoRequest,
  recordVoiceSuggestion,
  startConversation,
  type ConversationState,
} from '../../../features/conversations/domain/conversation';
import {
  MAX_PHOTO_REQUESTS_PER_FIELD,
  acceptsMorePhotos,
  decideNextAction,
  pendingFields,
  visionTargetsFor,
} from '../../../features/conversations/domain/vision-flow';

/**
 * docs/ai-agent.md §3a. Each test names the rule it protects.
 */

function conversation(): ConversationState {
  return startConversation('c1', 'u1', '2026-09-09T14:48:00.000Z');
}

function withBrandAndModality(state: ConversationState): ConversationState {
  let next = recordField(state, 'brand', {
    value: 'Philips',
    status: 'confirmed',
    confidence: 'high',
    source: 'image',
  });
  next = recordField(next, 'modality', {
    value: 'Monitor',
    status: 'confirmed',
    confidence: 'high',
    source: 'image',
  });
  return next;
}

describe('pendingFields', () => {
  it('puts vision-readable fields first, since the user has a camera in hand', () => {
    const order = pendingFields(conversation());
    expect(order.slice(0, 2)).toEqual(['brand', 'modality']);
    expect(order).toContain('quantity');
    expect(order).toContain('siteName');
  });

  it('omits fields already captured (rule 3: confirmed fields are not re-asked)', () => {
    expect(pendingFields(withBrandAndModality(conversation()))).not.toContain(
      'brand'
    );
  });
});

describe('decideNextAction', () => {
  it('asks for a photo of a vision-readable field first', () => {
    expect(decideNextAction(conversation(), { hadPhoto: false })).toEqual({
      type: 'ask_photo',
      field: 'brand',
      reason: 'field_not_visible',
    });
  });

  it('after one photo re-request, suggests voice (rule 1)', () => {
    const asked = recordPhotoRequest(conversation(), 'brand');
    expect(asked.fields.brand.photoRequests).toBe(MAX_PHOTO_REQUESTS_PER_FIELD);

    expect(decideNextAction(asked, { hadPhoto: true })).toEqual({
      type: 'suggest_voice',
      field: 'brand',
    });
  });

  it('never asks for a third photo of the same field (rule 1)', () => {
    let state = recordPhotoRequest(conversation(), 'brand');
    state = recordVoiceSuggestion(state, 'brand');

    const action = decideNextAction(state, { hadPhoto: true });
    expect(action.type).not.toBe('ask_photo');
    expect(action).toEqual({ type: 'ask_field', field: 'brand' });
  });

  it('never asks for a photo of something a photo cannot show', () => {
    // brand and modality captured; quantity and siteName remain, neither of
    // which is on a nameplate.
    const state = withBrandAndModality(conversation());
    const action = decideNextAction(state, { hadPhoto: true });

    expect(action.type).toBe('ask_field');
    expect(['quantity', 'siteName']).toContain(
      action.type === 'ask_field' ? action.field : null
    );
  });

  it('confirms once every required field is known', () => {
    let state = withBrandAndModality(conversation());
    state = recordField(state, 'quantity', {
      value: 5,
      status: 'reported',
      confidence: 'medium',
      source: 'voice',
    });
    state = recordField(state, 'siteName', {
      value: 'Hospital Example',
      status: 'reported',
      confidence: 'high',
      source: 'voice',
    });
    state = recordField(state, 'country', {
      value: 'Panamá',
      status: 'reported',
      confidence: 'high',
      source: 'voice',
    });
    state = recordField(state, 'city', {
      value: 'Ciudad de Panamá',
      status: 'reported',
      confidence: 'high',
      source: 'voice',
    });

    expect(decideNextAction(state, { hadPhoto: true })).toEqual({
      type: 'confirm',
    });
  });

  it('handles each field independently (rule 4)', () => {
    // brand exhausted its photo budget; modality has not.
    let state = recordPhotoRequest(conversation(), 'brand');
    state = recordVoiceSuggestion(state, 'brand');
    state = recordField(state, 'brand', {
      value: 'Philips',
      status: 'reported',
      confidence: 'medium',
      source: 'voice',
    });

    // With brand captured by voice, modality still gets its own photo attempt.
    expect(decideNextAction(state, { hadPhoto: true })).toEqual({
      type: 'ask_photo',
      field: 'modality',
      reason: 'field_not_visible',
    });
  });
});

describe('acceptsMorePhotos', () => {
  it('keeps the camera available for a vision-readable field (rule 2)', () => {
    expect(acceptsMorePhotos('brand')).toBe(true);
  });

  it('does not offer the camera for a field a photo cannot show', () => {
    expect(acceptsMorePhotos('quantity')).toBe(false);
  });
});

describe('visionTargetsFor', () => {
  it('targets only missing vision-readable fields', () => {
    const targets = visionTargetsFor(conversation());
    expect(targets).toEqual(
      expect.arrayContaining(['brand', 'modality', 'model', 'estimatedInstallationYear'])
    );
    expect(targets).not.toContain('quantity');
    expect(targets).not.toContain('siteName');
  });

  it('stops targeting a field once it is captured (rule 3)', () => {
    expect(visionTargetsFor(withBrandAndModality(conversation()))).not.toContain(
      'brand'
    );
  });

  it('contains no duplicates', () => {
    const targets = visionTargetsFor(conversation());
    expect(new Set(targets).size).toBe(targets.length);
  });
});
