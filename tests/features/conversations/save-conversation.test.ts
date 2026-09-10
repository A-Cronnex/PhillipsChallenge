import { saveConversation } from '../../../features/conversations/application/save-conversation';
import { startConversation, recordField } from '../../../features/conversations/domain/conversation';
import { emptyObservationDraft } from '../../../features/observations/domain/observation';
const now = () => new Date('2026-09-09T12:00:00Z');
const createState = () => recordField(startConversation('chat', 'user', now().toISOString()), 'brand', {
  value: 'Original', status: 'confirmed', confidence: 'high', source: 'image' });
const draft = { ...emptyObservationDraft(), siteId: 'site', visitDate: '2026-09-09', brand: 'Original', attributeConfidence: { brand: 'high' as const } };
const deps = () => ({ now, newId: () => 'observation', repository: { save: jest.fn(), latest: jest.fn(), finalize: jest.fn(async () => {}) } });
test('invalid review never reaches persistence', async () => {
  const d = deps();
  await expect(saveConversation(createState(), { ...draft, siteId: null }, d)).rejects.toThrow('Revisa');
  expect(d.repository.finalize).not.toHaveBeenCalled();
});
test('untouched image attributes retain their confidence and provenance', async () => {
  const d = deps();
  await saveConversation(createState(), draft, d);
  expect(d.repository.finalize).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    conversationId: 'chat', createdBy: 'user', overallConfidence: 'high',
    attributeConfidence: [{ attributeName: 'brand', confidenceLevel: 'high', attributeStatus: 'confirmed', source: 'image' }],
  }));
});
test('edited values are recorded as user reports and the reviewed conversation is auditable', async () => {
  const d = deps();
  await saveConversation(createState(), { ...draft, brand: 'Corregida' }, d);
  expect(d.repository.finalize).toHaveBeenCalledWith(expect.objectContaining({ fields: expect.objectContaining({ brand: expect.objectContaining({ value: 'Corregida', source: 'text', status: 'reported' }) }) }), expect.objectContaining({
    brand: 'Corregida', attributeConfidence: [expect.objectContaining({ attributeStatus: 'reported', source: 'text' })],
  }));
});
test('a failed transaction stays retryable and does not mark the supplied state saved', async () => {
  const d = deps(); const state = createState();
  d.repository.finalize.mockRejectedValueOnce(new Error('disk full'));
  await expect(saveConversation(state, draft, d)).rejects.toThrow('disk full');
  expect(state.status).toBe('collecting');
});
