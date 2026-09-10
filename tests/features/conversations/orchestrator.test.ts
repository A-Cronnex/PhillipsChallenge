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

    // The site name appears in what the user said: free-text values must be
    // the user's own words (docs/tech-stack.md §7.2), and the runtime only
    // ever sees the current turn, so a name absent from it would be dropped.
    const outcome = await submitText(
      conversation(),
      'cinco monitores Philips en el Hospital Example',
      deps(ai)
    );
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

describe('validation of what the model returned — docs/ai-agent.md §8', () => {
  it('does not record a value outside the allowed range, and reports it', async () => {
    const ai = runtime({
      text: [found('estimatedInstallationYear', 3025)],
    });

    const outcome = await submitText(
      conversation(),
      'lo instalaron hace años',
      deps(ai)
    );
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;

    expect(
      outcome.result.conversation.fields.estimatedInstallationYear.value
    ).toBeNull();
    expect(outcome.result.rejected).toContainEqual(
      expect.objectContaining({ code: 'out_of_range' })
    );
  });

  it('records a count the model returned as a string, as a number', async () => {
    const ai = runtime({ text: [found('quantity', '5')] });

    const outcome = await submitText(conversation(), 'son cinco', deps(ai));
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;

    expect(outcome.result.conversation.fields.quantity.value).toBe(5);
  });

  it('caps the confidence of a value the model itself called estimated (§9)', async () => {
    const ai = runtime({
      text: [found('brand', 'Philips', 'estimated', 'high')],
    });

    const outcome = await submitText(conversation(), 'creo que Philips', deps(ai));
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;

    expect(outcome.result.conversation.fields.brand.confidence).toBe('medium');
    expect(outcome.result.conversation.fields.brand.status).toBe('estimated');
  });
});

describe('free text stays in the user’s language — docs/tech-stack.md §7.2', () => {
  it('stores the user’s own sentence as notes, not the model’s English version', async () => {
    const utterance =
      'Uno de los monitores Philips está fuera de servicio desde marzo';
    const ai = runtime({
      text: [
        {
          values: [
            {
              field: 'notes',
              value: 'One Philips monitor has been out of service since March',
              status: 'reported',
              confidence: 'medium',
            },
          ],
          followUpQuestion: null,
        } as AgentExtraction,
      ],
    });

    const outcome = await submitText(conversation(), utterance, deps(ai));
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;

    expect(outcome.result.conversation.fields.notes.value).toBe(utterance);
    expect(outcome.result.rejected).toContainEqual(
      expect.objectContaining({ code: 'free_text_replaced_with_original' })
    );
  });

  it('does not record a translated city, and leaves the field for the agent to ask again', async () => {
    const ai = runtime({
      text: [found('city', 'Panama City')],
    });

    const outcome = await submitText(
      conversation(),
      'el hospital queda en Ciudad de Panamá, cerca del centro',
      deps(ai)
    );
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;

    expect(outcome.result.conversation.fields.city.value).toBeNull();
    expect(outcome.result.rejected).toContainEqual(
      expect.objectContaining({ code: 'free_text_not_in_user_language' })
    );
  });

  it('keeps a nameplate reading from a photo untouched', async () => {
    const ai = runtime({ image: [found('modality', 'Monitor')] });

    const outcome = await submitPhoto(conversation(), '/tmp/a.jpg', deps(ai));
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;

    expect(outcome.result.conversation.fields.modality.value).toBe('Monitor');
    expect(outcome.result.rejected).toEqual([]);
  });

  it('keeps the spoken words for a field answered by voice', async () => {
    const ai = runtime({
      transcript: 'rayos X',
      text: [found('modality', 'X-Ray')],
    });

    // The agent had just asked about the modality, so the reply is the answer.
    const asked: ConversationState = {
      ...conversation(),
      pendingField: 'modality',
      status: 'awaiting_clarification',
    };

    const outcome = await submitVoice(asked, '/tmp/a.m4a', deps(ai));
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;

    expect(outcome.result.conversation.fields.modality.value).toBe('rayos X');
    expect(outcome.result.conversation.fields.modality.source).toBe('voice');
  });
});

describe('durable input checkpoints', () => {
  it('persists typed input before calling inference', async () => {
    const ai = runtime({});
    const checkpoint = jest.fn(async (state: ConversationState) => {
      expect(state.turns.at(-1)?.text).toBe('dos equipos');
      expect(ai.textCalls).toHaveLength(0);
    });
    await submitText(conversation(), 'dos equipos', { ...deps(ai), checkpoint });
    expect(checkpoint).toHaveBeenCalledTimes(1);
    expect(ai.textCalls[0].targetFields).toEqual(expect.arrayContaining(['siteName', 'quantity', 'brand']));
  });
  it('does not infer if preserving the original input fails', async () => {
    const ai = runtime({});
    await expect(submitText(conversation(), 'dos', { ...deps(ai), checkpoint: async () => { throw new Error('disk full'); } })).rejects.toThrow('disk full');
    expect(ai.textCalls).toHaveLength(0);
  });
  it('preserves the audio reference even when transcription fails', async () => {
    const ai = runtime({ transcript: new Error('model unavailable') });
    const checkpoint = jest.fn(async () => {});
    const result = await submitVoice(conversation(), '/local/clip.m4a', { ...deps(ai), checkpoint });
    expect(result.status).toBe('inference_failed');
    if (result.status !== 'inference_failed') throw new Error('expected failure');
    expect(result.conversation.turns.at(-1)?.reference).toBe('/local/clip.m4a');
    expect(checkpoint).toHaveBeenCalledTimes(1);
  });
});
