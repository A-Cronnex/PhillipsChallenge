import { createQvacRuntime, type QvacApi } from '../../services/ai/qvac-runtime';
import { MODEL_REGISTRY_NAMES as names, OFFLINE_MODEL_ASSETS } from '../../services/ai/models';
import { formatBytes } from '../../lib/format';
import type { PrepareProgress } from '../../features/conversations/application/ports';

/** Everything cached except the vision pair, which is what a partial device looks like. */
const UNCACHED = new Set<string>([names.vision, names.visionProjector]);

function setup(options: { withDownloads?: boolean } = {}) {
  const api = {
    loadModel: jest.fn(async ({ modelSrc }: { modelSrc: string }) => modelSrc),
    completion: jest.fn(() => ({ text: Promise.resolve(JSON.stringify({ values: [] })) })),
    translate: jest.fn(() => ({ text: Promise.resolve('x') })),
    transcribe: jest.fn(async () => ''),
    getModelInfo: jest.fn(async ({ name }: { name: string }) => ({
      name, isCached: !UNCACHED.has(name), expectedSize: 1024 * 1024 * 100,
    })),
    downloadAsset: jest.fn(async ({ onProgress }: { onProgress?: (p: { downloaded: number }) => void }) => {
      onProgress?.({ downloaded: 1024 * 1024 * 50 });
      onProgress?.({ downloaded: 1024 * 1024 * 100 });
      return 'ok';
    }),
  };
  if (!options.withDownloads) { delete (api as Partial<typeof api>).downloadAsset; }
  const catalog = Object.fromEntries(Object.values(names).map(name => [name, name]));
  return { api, runtime: createQvacRuntime({ api: api as unknown as QvacApi, catalog }) };
}

test('reports which model weights this device is still missing, and their size', async () => {
  const { runtime, api } = setup();
  const readiness = await runtime.modelReadiness!();
  expect(api.getModelInfo).toHaveBeenCalledTimes(OFFLINE_MODEL_ASSETS.length);
  expect(readiness.allCached).toBe(false);
  expect(readiness.missing.map(asset => asset.name)).toEqual([names.vision, names.visionProjector]);
  expect(readiness.missingBytes).toBe(1024 * 1024 * 200);
  // Every asset carries a label the screen can show without a second lookup.
  expect(readiness.assets.every(asset => asset.label.length > 0)).toBe(true);
});

test('a registry lookup failure reports "not cached" instead of blocking the screen', async () => {
  const { runtime, api } = setup();
  api.getModelInfo.mockRejectedValueOnce(new Error('rpc down'));
  const readiness = await runtime.modelReadiness!();
  expect(readiness.missing.length).toBe(3);
  expect(readiness.allCached).toBe(false);
});

test('an asset the SDK registry does not know is excluded, not counted as missing forever', async () => {
  // Regression: `BERGAMOT_ES_EN_LEX`/`_VOCAB` named registry entries that do
  // not exist, so the indicator read "faltan 2" however often the user
  // downloaded, and `prepare` would have thrown resolving their descriptors.
  const { api } = setup({ withDownloads: true });
  const catalog = Object.fromEntries(Object.values(names).map(name => [name, name]));
  delete (catalog as Record<string, unknown>)[names.speechVad];
  const runtime = createQvacRuntime({ api: api as unknown as QvacApi, catalog });

  const readiness = await runtime.modelReadiness!();
  expect(readiness.assets.map(asset => asset.name)).not.toContain(names.speechVad);
  expect(readiness.missing.map(asset => asset.name)).not.toContain(names.speechVad);
  expect(readiness.assets.length).toBe(OFFLINE_MODEL_ASSETS.length - 1);

  // And preparing still succeeds rather than throwing on the absent descriptor.
  await expect(runtime.prepare()).resolves.toBeUndefined();
});

test('prepare downloads only the missing weights and reports aggregate progress', async () => {
  const { runtime, api } = setup({ withDownloads: true });
  const updates: PrepareProgress[] = [];
  await runtime.prepare(update => updates.push(update));

  expect(api.downloadAsset).toHaveBeenCalledTimes(2);
  // Fractions never exceed 1 and end complete.
  expect(updates.every(update => update.fraction >= 0 && update.fraction <= 1)).toBe(true);
  expect(updates[updates.length - 1]).toMatchObject({ fraction: 1, current: null });
  expect(updates.some(update => update.current === 'VisionPsy-Nano-460M-Flash')).toBe(true);
  // The text model is still loaded into memory afterwards.
  expect(api.loadModel).toHaveBeenCalledWith(expect.objectContaining({ modelSrc: names.text }));
  expect(await runtime.isReady()).toBe(true);
});

test('an adapter without download support still prepares the text model', async () => {
  const { runtime, api } = setup();
  await runtime.prepare();
  expect(api.loadModel).toHaveBeenCalledWith(expect.objectContaining({ modelSrc: names.text }));
});

test('formats download sizes for a field user', () => {
  expect(formatBytes(0)).toBe('0 B');
  expect(formatBytes(-1)).toBe('0 B');
  expect(formatBytes(900)).toBe('900 B');
  expect(formatBytes(1024 * 1024 * 200)).toBe('200 MB');
  expect(formatBytes(1024 * 1024 * 1024 * 1.44)).toBe('1.4 GB');
});
