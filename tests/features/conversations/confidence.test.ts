/**
 * docs/ai-agent.md §9 — confidence stored per attribute, overall confidence
 * derived by an explicit rule.
 */
import {
  attributeConfidenceRecords,
  capConfidenceByStatus,
  conversationOverallConfidence,
} from '../../../features/conversations/domain/confidence';
import {
  recordField,
  startConversation,
  type ConversationState,
} from '../../../features/conversations/domain/conversation';
import type { CaptureField } from '../../../features/conversations/domain/fields';
import type {
  AttributeStatus,
  CaptureSource,
  ConfidenceLevel,
} from '../../../types/domain';

const NOW = '2026-09-09T14:48:00.000Z';

function conversation(
  captured: Array<
    [CaptureField, string | number, ConfidenceLevel, AttributeStatus?, CaptureSource?]
  >
): ConversationState {
  let state = startConversation('c1', 'u1', NOW);
  for (const [field, value, confidence, status = 'reported', source = 'text'] of captured) {
    state = recordField(state, field, { value, status, confidence, source });
  }
  return state;
}

describe('capConfidenceByStatus', () => {
  it('caps an estimated value at medium — an approximation is not near-certainty', () => {
    expect(capConfidenceByStatus('estimated', 'high')).toBe('medium');
  });

  it('never raises a confidence', () => {
    expect(capConfidenceByStatus('estimated', 'low')).toBe('low');
    expect(capConfidenceByStatus('reported', 'medium')).toBe('medium');
    expect(capConfidenceByStatus('confirmed', 'high')).toBe('high');
  });

  it('leaves nothing to be confident about when the status is unknown', () => {
    expect(capConfidenceByStatus('unknown', 'high')).toBeNull();
  });
});

describe('attributeConfidenceRecords', () => {
  it('produces one row per confidence-bearing attribute that is actually known', () => {
    const state = conversation([
      ['brand', 'Philips', 'high', 'confirmed', 'image'],
      ['modality', 'Monitor', 'medium'],
    ]);

    expect(attributeConfidenceRecords(state)).toEqual([
      {
        attributeName: 'brand',
        confidenceLevel: 'high',
        attributeStatus: 'confirmed',
        source: 'image',
      },
      {
        attributeName: 'modality',
        confidenceLevel: 'medium',
        attributeStatus: 'reported',
        source: 'text',
      },
    ]);
  });

  it('maps estimatedInstallationYear onto the installation_year attribute', () => {
    const state = conversation([['estimatedInstallationYear', 2014, 'low', 'estimated']]);

    expect(attributeConfidenceRecords(state)).toEqual([
      {
        attributeName: 'installation_year',
        confidenceLevel: 'low',
        attributeStatus: 'estimated',
        source: 'text',
      },
    ]);
  });

  it('keeps the source that produced each attribute (docs/domain-model.md §9)', () => {
    const state = conversation([
      ['brand', 'Philips', 'high', 'confirmed', 'image'],
      ['modality', 'Monitor', 'medium', 'reported', 'voice'],
    ]);

    expect(attributeConfidenceRecords(state).map((r) => r.source)).toEqual([
      'image',
      'voice',
    ]);
  });

  it('produces no rows for fields the domain model does not give a confidence attribute', () => {
    const state = conversation([
      ['quantity', 5, 'high'],
      ['siteName', 'Hospital Santo Tomás', 'high'],
      ['notes', 'algo', 'low'],
    ]);

    expect(attributeConfidenceRecords(state)).toEqual([]);
  });

  it('produces no row for a field that was never captured', () => {
    expect(attributeConfidenceRecords(conversation([]))).toEqual([]);
  });
});

describe('conversationOverallConfidence', () => {
  it('applies the same explicit rule as manual capture — the weakest attribute wins', () => {
    const state = conversation([
      ['brand', 'Philips', 'high'],
      ['model', 'MX450', 'low'],
      ['modality', 'Monitor', 'high'],
    ]);

    expect(conversationOverallConfidence(state)).toBe('low');
  });

  it('is null when nothing rated has been captured — unrated is not low', () => {
    expect(conversationOverallConfidence(conversation([]))).toBeNull();
    expect(
      conversationOverallConfidence(conversation([['quantity', 5, 'high']]))
    ).toBeNull();
  });
});
