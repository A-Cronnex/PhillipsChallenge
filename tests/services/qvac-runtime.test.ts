import { createQvacRuntime, localFilePath, type QvacApi } from '../../services/ai/qvac-runtime';
import { MODEL_REGISTRY_NAMES as names } from '../../services/ai/models';

function setup() {
  const api = {
    loadModel: jest.fn(async ({ modelSrc }: { modelSrc: string }) => modelSrc),
    completion: jest.fn(() => ({ text: Promise.resolve(JSON.stringify({ values: [], followUpQuestion: 'Which brand?' })) })),
    translate: jest.fn(() => ({ text: Promise.resolve('¿Qué marca?') })),
    transcribe: jest.fn(async () => 'dos equipos'),
  };
  const catalog = Object.fromEntries(Object.values(names).map(name => [name, name]));
  return { api, runtime: createQvacRuntime({ api: api as unknown as QvacApi, catalog }) };
}

test('awaits completion.text and keeps the original Spanish input alongside the working translation', async () => {
  const { api, runtime } = setup();
  const result = await runtime.extractFromText({ text: 'dos equipos en Panamá', language: 'es', targetFields: ['quantity'] });
  expect(result.followUpQuestion).toBe('¿Qué marca?');
  expect(api.translate).toHaveBeenCalledTimes(2);
  expect(api.completion.mock.calls[0]).toBeDefined();
  expect(JSON.stringify(api.completion.mock.calls)).toContain('dos equipos en Panamá');
  expect(api.loadModel).toHaveBeenCalledWith(expect.objectContaining({ modelSrc: names.translationEsEn,
    modelConfig: { engine: 'Bergamot', from: 'es', to: 'en' } }));
});
test('English capture skips the bridge', async () => {
  const { api, runtime } = setup();
  await runtime.extractFromText({ text: 'two', language: 'en', targetFields: ['quantity'] });
  expect(api.translate).not.toHaveBeenCalled();
});
test('loads the projector with vision and passes a filesystem path', async () => {
  const { api, runtime } = setup();
  await runtime.extractFromImage({ imagePath: 'file:///data/my%20photo.jpg', language: 'es', targetFields: ['brand'] });
  expect(api.loadModel).toHaveBeenCalledWith(expect.objectContaining({ modelSrc: names.vision,
    modelConfig: expect.objectContaining({ projectionModelSrc: names.visionProjector }) }));
  expect(api.completion).toHaveBeenCalledWith(expect.objectContaining({ history: [expect.objectContaining({ attachments: [{ path: '/data/my photo.jpg' }] })] }));
});
test('speech uses audioChunk and preserves a local path', async () => {
  const { api, runtime } = setup();
  expect(await runtime.transcribe('file:///data/audio.m4a')).toBe('dos equipos');
  expect(api.transcribe).toHaveBeenCalledWith({ modelId: names.speech, audioChunk: '/data/audio.m4a' });
});
test('concurrent preparation shares model loading and failed loading can retry', async () => {
  const { api, runtime } = setup();
  api.loadModel.mockRejectedValueOnce(new Error('storage'));
  await expect(runtime.prepare()).rejects.toThrow('storage');
  await Promise.all([runtime.prepare(), runtime.prepare()]);
  expect(api.loadModel).toHaveBeenCalledTimes(2);
  expect(await runtime.isReady()).toBe(true);
});
test('never passes network URLs to native file APIs', () => {
  expect(() => localFilePath('https://example.org/image')).toThrow('archivo local');
  expect(() => localFilePath('content://camera/image')).toThrow('archivo local');
});
