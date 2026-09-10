import { createQvacRuntime, localFilePath, type QvacApi } from '../../services/ai/qvac-runtime';
import { MODEL_REGISTRY_NAMES as names } from '../../services/ai/models';

function setup() {
  const api = {
    loadModel: jest.fn(async ({ modelSrc }: { modelSrc: string }) => modelSrc),
    completion: jest.fn(() => ({ text: Promise.resolve(JSON.stringify({ values: [] })) })),
    translate: jest.fn(() => ({ text: Promise.resolve('¿Qué marca?') })),
    transcribe: jest.fn(async () => 'dos equipos'),
  };
  const catalog = Object.fromEntries(Object.values(names).map(name => [name, name]));
  return { api, runtime: createQvacRuntime({ api: api as unknown as QvacApi, catalog }) };
}

test('awaits completion.text and keeps the original Spanish input alongside the working translation', async () => {
  const { api, runtime } = setup();
  await runtime.extractFromText({ text: 'dos equipos en Panamá', language: 'es', targetFields: ['quantity'] });
  // Only the es→en working copy is translated now — MedPsy no longer produces
  // a followUpQuestion, so there is nothing left to translate back (2026-09-10).
  expect(api.translate).toHaveBeenCalledTimes(1);
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

test('streams completion events to responding without exposing raw JSON to the UI', async () => {
  const { api, runtime } = setup();
  const responding = jest.fn();
  const payload = JSON.stringify({ values: [] });
  api.completion.mockReturnValueOnce({ text: Promise.resolve(payload), events: (async function* () {
    yield { type: 'contentDelta', text: '{"values":' };
    yield { type: 'contentDelta', text: '[]}' };
  })() } as never);
  await runtime.extractFromText({ text: 'two monitors', language: 'en', targetFields: ['brand'], onResponding: responding });
  expect(responding).toHaveBeenCalledTimes(2);
  expect(api.completion).toHaveBeenCalledWith(expect.objectContaining({ stream: true }));
});

test('loads Silero with Whisper and applies replacement versus appended streaming segments', async () => {
  const { api } = setup();
  const native = { write: jest.fn(), end: jest.fn(), destroy: jest.fn(), stats: Promise.resolve(undefined),
    async *[Symbol.asyncIterator]() {
      yield { text: 'dos', append: false, id: 0, startMs: 0, endMs: 100 };
      yield { text: 'dos monitores', append: false, id: 0, startMs: 0, endMs: 300 };
      yield { text: 'Philips', append: true, id: 1, startMs: 300, endMs: 400 };
    } };
  const transcribeStream = jest.fn(async () => native);
  const catalog = Object.fromEntries(Object.values(names).map(name => [name, name]));
  const runtime = createQvacRuntime({ api: { ...api, transcribeStream } as unknown as QvacApi, catalog });
  const partial = jest.fn();
  const session = await runtime.openSpeechSession!(partial);
  const pcm = new Uint8Array([0, 0, 1, 0]); session.write(pcm);
  expect(await session.finish()).toBe('dos monitores Philips');
  expect(partial.mock.calls.map(call => call[0])).toEqual(['dos', 'dos monitores', 'dos monitores Philips']);
  expect(native.write).toHaveBeenCalledWith(pcm);
  expect(native.end).toHaveBeenCalledTimes(1);
  expect(api.loadModel).toHaveBeenCalledWith(expect.objectContaining({ modelSrc: names.speech,
    modelConfig: expect.objectContaining({ vadModelSrc: names.speechVad, audio_format: 's16le', language: 'es', translate: false }) }));
  session.cancel(); expect(native.destroy).toHaveBeenCalledTimes(1);
});
