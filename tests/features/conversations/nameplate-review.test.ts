import { analyzeNameplate, validateNameplateEdits } from '../../../features/conversations/application/nameplate-review';
import { submitReviewedPhoto, submitVoiceTranscript } from '../../../features/conversations/application/conversation-orchestrator';
import { addTurn, startConversation } from '../../../features/conversations/domain/conversation';
import type { AiRuntime } from '../../../features/conversations/application/ports';
import type { AgentExtraction, ExtractedValue } from '../../../features/conversations/domain/extraction';

const brand: ExtractedValue = { field: 'brand', value: 'Philips', status: 'confirmed', confidence: 'high' };
const model: ExtractedValue = { field: 'model', value: 'MX450', status: 'confirmed', confidence: 'medium' };
const initial = () => startConversation('c1', 'u1', '2026-09-10T00:00:00Z');
function runtime(output: AgentExtraction): AiRuntime {
  return { isReady: async () => true, prepare: async () => {}, extractFromImage: jest.fn(async () => output),
    extractFromText: jest.fn(async () => output), transcribe: jest.fn(async () => 'dos equipos') };
}
const valid = { values: [brand, model], nameplate: 'detected' as const };
const deps = (ai: AiRuntime) => ({ runtime: ai, now: () => new Date('2026-09-10T00:00:00Z'), language: 'es' as const, checkpoint: jest.fn(async () => {}) });

test.each(['not_detected', 'uncertain', undefined] as const)('refuses a photo without explicit plate detection: %s', async nameplate => {
  await expect(analyzeNameplate(runtime({ ...valid, nameplate }), initial(), '/photo.jpg')).rejects.toThrow(/placa/);
});
test('stages validated data without altering the conversation or inventing missing fields', async () => {
  const state = initial();
  const proposal = await analyzeNameplate(runtime(valid), state, '/photo.jpg');
  expect(proposal.values).toEqual([brand, model]);
  expect(state.turns).toEqual([]);
  expect(state.fields.brand.value).toBeNull();
});
test('filters fields outside the photo targets, duplicates and invalid years', async () => {
  const output = { ...valid, values: [brand, brand, { ...brand, field: 'quantity' as const, value: 2 },
    { ...brand, field: 'estimatedInstallationYear' as const, value: 3000 }] };
  const proposal = await analyzeNameplate(runtime(output), initial(), '/photo.jpg');
  expect(proposal.values).toEqual([brand]);
  expect(proposal.rejected.length).toBe(3);
});
test('does not overwrite already confirmed fields with a new photo', async () => {
  const state = initial(); state.fields.brand = { ...state.fields.brand, ...brand, source: 'image' };
  const proposal = await analyzeNameplate(runtime(valid), state, '/photo.jpg');
  expect(proposal.values).toEqual([model]);
});
test('a detected plate with nothing legible still reaches review, with the fields listed as unreadable', async () => {
  const proposal = await analyzeNameplate(runtime({ ...valid, values: [{ ...brand, value: null, status: 'unknown' }] }), initial(), '/photo.jpg');
  expect(proposal.nameplate).toBe('detected');
  expect(proposal.values).toEqual([]);
  expect(proposal.unreadable).toEqual(expect.arrayContaining(['brand', 'modality']));
  // ...but an all-empty review still cannot be submitted.
  expect(() => validateNameplateEdits(proposal, proposal.unreadable.map(field => ({ field, value: null, status: 'unknown' as const, confidence: 'low' as const })))).toThrow(/al menos un dato/);
});
test('rejects invalid human edits', async () => {
  const proposal = await analyzeNameplate(runtime(valid), initial(), '/photo.jpg');
  expect(() => validateNameplateEdits(proposal, [{ ...brand, field: 'quantity', value: -1 }])).toThrow();
  expect(() => validateNameplateEdits(proposal, [{ ...brand, value: null }])).toThrow();
});
test('approval joins the ordinary conversation while preserving confidence and mixed provenance', async () => {
  const ai = runtime(valid); const d = deps(ai);
  const proposal = await analyzeNameplate(ai, initial(), '/photo.jpg');
  const result = await submitReviewedPhoto(initial(), proposal, [brand, { ...model, value: 'MX500' }], d);
  expect(result.status).toBe('ok');
  if (result.status !== 'ok') throw new Error('expected valid turn');
  expect(result.result.conversation.fields.brand).toMatchObject({ value: 'Philips', confidence: 'high', source: 'image', status: 'confirmed' });
  expect(result.result.conversation.fields.model).toMatchObject({ value: 'MX500', confidence: 'medium', source: 'text', status: 'reported' });
  expect(result.result.conversation.turns[0]).toMatchObject({ source: 'image', reference: '/photo.jpg' });
  expect(result.result.message).toBeTruthy();
  expect(ai.extractFromImage).toHaveBeenCalledTimes(1);
  expect(d.checkpoint).toHaveBeenCalledTimes(1);
});
test('retries approval after checkpoint failure without duplicating the photo turn', async () => {
  const ai = runtime(valid); const d = deps(ai);
  const proposal = await analyzeNameplate(ai, initial(), '/photo.jpg');
  const first = await submitReviewedPhoto(initial(), proposal, proposal.values, d);
  if (first.status !== 'ok') throw new Error('expected valid turn');
  const retried = await submitReviewedPhoto(first.result.conversation, proposal, proposal.values, d);
  expect(retried.status === 'ok' && retried.result.conversation.turns).toHaveLength(1);
});
test('final live transcript replaces its audio checkpoint and is not transcribed twice', async () => {
  const ai = runtime({ values: [] }); const d = deps(ai);
  const state = addTurn(initial(), { role: 'user', text: '[audio pendiente de transcripción]', source: 'voice', reference: '/audio.wav', at: d.now().toISOString() });
  const result = await submitVoiceTranscript(state, 'dos equipos', '/audio.wav', d);
  expect(result.status === 'ok' && result.result.conversation.turns).toEqual([expect.objectContaining({ text: 'dos equipos', source: 'voice', reference: '/audio.wav' })]);
  expect(ai.transcribe).not.toHaveBeenCalled();
  expect(ai.extractFromText).toHaveBeenCalledWith(expect.objectContaining({ text: 'dos equipos', language: 'es' }));
});
