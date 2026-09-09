import type {
  AiRuntime,
  ImageExtractionRequest,
  TextExtractionRequest,
} from '../../../features/conversations/application/ports';
import {
  submitPhoto,
  submitText,
  submitVoice,
} from '../../../features/conversations/application/conversation-orchestrator';
import {
  startConversation,
  type ConversationState,
} from '../../../features/conversations/domain/conversation';
import type { AgentExtraction } from '../../../features/conversations/domain/extraction';

const NOW = new Date('2026-09-09T14:48:00.000Z');

/**
 * A fake runtime. QVAC cannot run under Jest (docs/ai-agent.md §12), so the
 * agent's behaviour is exercised against scripted model responses. What this
 * does NOT prove is that a real model returns anything resembling these shapes
 * — that needs a physical device.
 */
function runtime(script: {
  image?: Array<AgentExtraction | Error>;
  text?: Array<AgentExtraction | Error>;
  transcript?: string | Error;
}): AiRuntime & { imageCalls: ImageExtractionRequest[]; textCalls: TextExtractionRequest[] } {
  const imageCalls: ImageExtractionRequest[] = [];
  const textCalls: TextExtractionRequest[] = [];
  const image = [...(script.image ?? [])];
  const text = [...(script.text ?? [])];

  const nothing: AgentExtraction = { values: [], followUpQuestion: null };

  return {
    imageCalls,
    textCalls,
    isReady: async () => true,
    prepare: async () => {},
    async extractFromImage(request) {
      imageCalls.push(request);
      const next = image.shift() ?? nothing;
      if (next instanceof Error) throw next;
      return next;
    },
    async extractFromText(request) {
      textCalls.push(request);
      const next = text.shift() ?? nothing;
      if (next instanceof Error) throw next;
      return next;
    },
    async transcribe() {
      const t = script.transcript ?? '';
      if (t instanceof Error) throw t;
      return t;
    },
  };
}

function conversation(): ConversationState {
  return startConversation('c1', 'u1', NOW.toISOString());
}

const deps = (ai: AiRuntime) => ({ runtime: ai, now: () => NOW, language: 'es' as const });

const found = (
  field: string,
  value: string | number,
  status = 'confirmed',
  confidence = 'high'
): AgentExtraction => ({
  values: [{ field, value, status, confidence }] as AgentExtraction['values'],
  followUpQuestion: null,
});

describe('submitPhoto — docs/ai-agent.md §3a', () => {
  it('extracts a field the photo shows and marks it as captured from the image', async () => {
    const ai = runtime({ image: [found('brand', 'Philips')] });
    const outcome = await submitPhoto(conversation(), '/tmp/a.jpg', deps(ai));

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    const brand = outcome.result.conversation.fields.brand;
    expect(brand.value).toBe('Philips');
    expect(brand.source).toBe('image');
    expect(brand.status).toBe('confirmed');
  });

  it('only targets missing vision-readable fields', async () => {
    const ai = runtime({ image: [found('brand', 'Philips')] });
    await submitPhoto(conversation(), '/tmp/a.jpg', deps(ai));

    expect(ai.imageCalls[0].targetFields).toEqual(
      expect.arrayContaining(['brand', 'modality'])
    );
    expect(ai.imageCalls[0].targetFields).not.toContain('quantity');
  });

  it('asks for another photo when the field is not visible', async () => {
    const ai = runtime({ image: [{ values: [], followUpQuestion: null }] });
    const outcome = await submitPhoto(conversation(), '/tmp/a.jpg', deps(ai));

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.result.action).toEqual({
      type: 'ask_photo',
      field: 'brand',
      reason: 'field_not_visible',
    });
    expect(outcome.result.message).toMatch(/foto de la placa/);
    expect(outcome.result.conversation.status).toBe('awaiting_clarification');
  });

  it('suggests voice after the second photo also fails (rule 1)', async () => {
    const empty = { values: [], followUpQuestion: null };
    const ai = runtime({ image: [empty, empty] });

    const first = await submitPhoto(conversation(), '/tmp/a.jpg', deps(ai));
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') return;

    const second = await submitPhoto(first.result.conversation, '/tmp/b.jpg', deps(ai));
    expect(second.status).toBe('ok');
    if (second.status !== 'ok') return;

    expect(second.result.action).toEqual({ type: 'suggest_voice', field: 'brand' });
    expect(second.result.message).toMatch(/¿Prefieres decírmelo por voz\?/);
    // Rule 2: the suggestion does not close the door on more photos.
    expect(second.result.message).toMatch(/otra foto/);
  });

  it('does not re-ask a field captured from an earlier photo (rule 3)', async () => {
    const ai = runtime({
      image: [found('brand', 'Philips'), { values: [], followUpQuestion: null }],
    });

    const first = await submitPhoto(conversation(), '/tmp/a.jpg', deps(ai));
    if (first.status !== 'ok') throw new Error('expected ok');
    const second = await submitPhoto(first.result.conversation, '/tmp/b.jpg', deps(ai));
    if (second.status !== 'ok') throw new Error('expected ok');

    expect(ai.imageCalls[1].targetFields).not.toContain('brand');
    expect(second.result.conversation.fields.brand.value).toBe('Philips');
  });

  it('mixes image and voice capture in one conversation (rule 4)', async () => {
    const ai = runtime({
      image: [found('brand', 'Philips')],
      text: [found('quantity', 5, 'reported', 'medium')],
      transcript: 'hay cinco monitores',
    });

    const afterPhoto = await submitPhoto(conversation(), '/tmp/a.jpg', deps(ai));
    if (afterPhoto.status !== 'ok') throw new Error('expected ok');

    const afterVoice = await submitVoice(
      afterPhoto.result.conversation,
      '/tmp/a.m4a',
      deps(ai)
    );
    if (afterVoice.status !== 'ok') throw new Error('expected ok');

    const fields = afterVoice.result.conversation.fields;
    expect(fields.brand.source).toBe('image');
    expect(fields.quantity.source).toBe('voice');
  });
});

describe('submitVoice', () => {
  it('keeps the transcript as the turn text, in the user’s language', async () => {
    const ai = runtime({
      transcript: 'hay cinco monitores Philips',
      text: [found('quantity', 5, 'reported', 'medium')],
    });

    const outcome = await submitVoice(conversation(), '/tmp/a.m4a', deps(ai));
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;

    const turn = outcome.result.conversation.turns.at(-1);
    expect(turn?.text).toBe('hay cinco monitores Philips');
    expect(turn?.source).toBe('voice');
  });

  it('reports a transcription failure without losing the conversation', async () => {
    const ai = runtime({ transcript: new Error('whisper model missing') });
    const outcome = await submitVoice(conversation(), '/tmp/a.m4a', deps(ai));

    expect(outcome.status).toBe('inference_failed');
    if (outcome.status !== 'inference_failed') return;
    expect(outcome.reason).toContain('whisper model missing');
  });
});

describe('failure handling — docs/ai-agent.md §13', () => {
  it('preserves the conversation when inference throws', async () => {
    const ai = runtime({ image: [new Error('out of memory')] });
    const outcome = await submitPhoto(conversation(), '/tmp/a.jpg', deps(ai));

    expect(outcome.status).toBe('inference_failed');
    if (outcome.status !== 'inference_failed') return;
    // The user's photo turn is still recorded, so nothing they did is lost.
    expect(outcome.conversation.turns).toHaveLength(1);
    expect(outcome.conversation.turns[0].reference).toBe('/tmp/a.jpg');
    expect(outcome.conversation.lastError).toContain('out of memory');
  });

  it('fabricates no record when the model output is unusable', async () => {
    const ai: AiRuntime = {
      isReady: async () => true,
      prepare: async () => {},
      extractFromImage: async () => ({ notValues: true }) as never,
      extractFromText: async () => ({ notValues: true }) as never,
      transcribe: async () => '',
    };

    const outcome = await submitPhoto(conversation(), '/tmp/a.jpg', deps(ai));
    expect(outcome.status).toBe('unusable_output');
    if (outcome.status !== 'unusable_output') return;
    expect(outcome.issues.length).toBeGreaterThan(0);
  });

  it('surfaces rejected model entries instead of hiding them', async () => {
    const ai: AiRuntime = {
      isReady: async () => true,
      prepare: async () => {},
      extractFromImage: async () =>
        ({
          values: [
            { field: 'serialNumber', value: 'X1', status: 'confirmed', confidence: 'high' },
          ],
          followUpQuestion: null,
        }) as never,
      extractFromText: async () => ({ values: [], followUpQuestion: null }),
      transcribe: async () => '',
    };

    const outcome = await submitPhoto(conversation(), '/tmp/a.jpg', deps(ai));
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.result.rejected[0].code).toBe('unknown_field');
  });
});

describe('completion of the conversation', () => {
  it('moves to awaiting_confirmation once every required field is known', async () => {
    const all: AgentExtraction = {
      values: [
        { field: 'brand', value: 'Philips', status: 'confirmed', confidence: 'high' },
        { field: 'modality', value: 'Monitor', status: 'confirmed', confidence: 'high' },
        { field: 'quantity', value: 5, status: 'reported', confidence: 'medium' },
        { field: 'siteName', value: 'Hospital Example', status: 'reported', confidence: 'high' },
      ],
      followUpQuestion: null,
    };
    const ai = runtime({ text: [all] });

    const outcome = await submitText(conversation(), 'cinco monitores Philips', deps(ai));
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;

    expect(outcome.result.action).toEqual({ type: 'confirm' });
    expect(outcome.result.conversation.status).toBe('awaiting_confirmation');
  });

  it('prefers the model’s own follow-up question when it produced one', async () => {
    const ai = runtime({
      text: [{ values: [], followUpQuestion: '¿De qué marca son los equipos?' }],
    });

    const outcome = await submitText(conversation(), 'hola', deps(ai));
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.result.message).toBe('¿De qué marca son los equipos?');
  });
});
