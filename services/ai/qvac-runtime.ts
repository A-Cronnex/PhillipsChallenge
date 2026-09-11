import type { ModelDescriptor } from '@qvac/inference/surface';
/** SDK adapter. Runtime imports live in lib/ai-runtime.ts; these imports are type-only.
 * Verified against installed SDK 0.19 declarations/examples. Hardware behavior still needs a device.
 */
import type {
  AiRuntime,
  ImageExtractionRequest,
  ModelAsset,
  ModelReadiness,
  PrepareProgress,
  TextExtractionRequest,
} from '../../features/conversations/application/ports';
import type { AgentExtraction } from '../../features/conversations/domain/extraction';
import {
  parseExtraction,
  normalizeExtraction,
  EXTRACTION_JSON_SCHEMA,
  VISION_EXTRACTION_JSON_SCHEMA,
} from '../../features/conversations/domain/extraction';
import {
  extractJsonPayload,
  imageExtractionPrompt,
  textExtractionPrompt,
} from './prompts';
import { MODEL_REGISTRY_NAMES, OFFLINE_MODEL_ASSETS } from './models';

/**
 * The subset of `@qvac/sdk` this adapter uses.
 *
 * Derived from the installed SDK to catch API drift at compilation, with no native import in Jest.
 */
export type QvacApi = Pick<typeof import('@qvac/sdk'), 'loadModel' | 'completion' | 'transcribe' | 'transcribeStream' | 'translate'>
  & Partial<Pick<typeof import('@qvac/sdk'), 'downloadAsset' | 'getModelInfo'>>;

/** Bare expects filesystem paths; HTTP/content URIs are not local files. */
export function localFilePath(uri: string): string {
  if (uri.startsWith('file://')) return decodeURIComponent(uri.slice(7));
  if (uri.startsWith('/')) return uri;
  throw new Error('Se requiere un archivo local del dispositivo.');
}

/** Registry descriptors, looked up by name at load time. */
export interface QvacModelCatalog {
  [name: string]: unknown;
}

export interface QvacRuntimeOptions {
  api: QvacApi;
  catalog: QvacModelCatalog;
}

export class ModelDescriptorMissingError extends Error {
  constructor(name: string) {
    super(
      `QVAC model registry has no entry named "${name}". The registry constant ` +
        `may have been renamed between SDK versions — see services/ai/models.ts.`
    );
    this.name = 'ModelDescriptorMissingError';
  }
}

export class UnusableModelOutputError extends Error {
  constructor(modelRole: string) {
    // Deliberately does not include the model's raw output: it can contain the
    // user's own words about a hospital (docs/ai-agent.md §14).
    super(`The ${modelRole} model returned no parseable JSON payload.`);
    this.name = 'UnusableModelOutputError';
  }
}

export function createQvacRuntime(options: QvacRuntimeOptions): AiRuntime {
  const loaded = new Map<string, string>();

  function descriptor(name: string): ModelDescriptor {
    const entry = options.catalog[name];
    if (entry === undefined) throw new ModelDescriptorMissingError(name);
    return entry as ModelDescriptor;
  }

  const loading = new Map<string, Promise<string>>();
  async function modelId(name: string): Promise<string> {
    const existing = loaded.get(name);
    if (existing) return existing;
    const pending = loading.get(name);
    if (pending) return pending;
    const direction = name === MODEL_REGISTRY_NAMES.translationEsEn ? { from: 'es', to: 'en' }
      : name === MODEL_REGISTRY_NAMES.translationEnEs ? { from: 'en', to: 'es' } : null;
    const task = options.api.loadModel({ modelSrc: descriptor(name),
      ...(name === MODEL_REGISTRY_NAMES.vision ? { modelConfig: {
        projectionModelSrc: descriptor(MODEL_REGISTRY_NAMES.visionProjector), ctx_size: 2048,
      } } : name === MODEL_REGISTRY_NAMES.speech ? { modelConfig: {
        vadModelSrc: descriptor(MODEL_REGISTRY_NAMES.speechVad), audio_format: 's16le', language: 'es', translate: false,
      } } : direction ? { modelConfig: { engine: 'Bergamot', ...direction } } : {}),
    }).then(id => { loaded.set(name, id); return id; });
    loading.set(name, task);
    try { return await task; } finally { loading.delete(name); }
  }

  /**
   * Which of `OFFLINE_MODEL_ASSETS` this device already holds. Pure query:
   * `getModelInfo` reads QVAC's cache index and downloads nothing.
   */
  async function modelReadiness(): Promise<ModelReadiness> {
    const getInfo = options.api.getModelInfo;
    const assets: (ModelAsset | null)[] = await Promise.all(
      OFFLINE_MODEL_ASSETS.map(async ({ name, label }): Promise<ModelAsset | null> => {
        // A name this SDK build does not know is not a missing download — it
        // can never become cached, and counting it would show "faltan N"
        // forever however many times the user downloads. Reported in dev and
        // excluded. (This caught `BERGAMOT_ES_EN_LEX`/`_VOCAB`, constants that
        // named registry entries which do not exist; see models.ts.)
        if (options.catalog[name] === undefined) {
          if (__DEV__) console.warn(`[ai] "${name}" is not in the QVAC registry; excluded from the offline set.`);
          return null;
        }
        if (!getInfo) return { name, label, cached: false, bytes: 0 };
        try {
          const info = await getInfo({ name });
          return { name, label, cached: info.isCached, bytes: info.expectedSize ?? 0 };
        } catch {
          // An RPC failure must not stop the screen from opening. Reported as
          // "not cached" so the UI offers the download rather than promising
          // offline capture it cannot deliver.
          return { name, label, cached: false, bytes: 0 };
        }
      })
    );
    return summarize(assets.filter((asset): asset is ModelAsset => asset !== null));
  }

  function summarize(assets: ModelAsset[]): ModelReadiness {
    const missing = assets.filter((asset) => !asset.cached);
    return {
      assets,
      missing,
      missingBytes: missing.reduce((total, asset) => total + asset.bytes, 0),
      allCached: missing.length === 0,
    };
  }

  async function complete(
    name: string,
    role: string,
    prompt: string,
    schema: Record<string, unknown>,
    imagePath?: string,
    onResponding?: () => void
  ): Promise<AgentExtraction> {
    const id = await modelId(name);
    const response = await options.api.completion({
      modelId: id,
      history: [
        {
          role: 'user',
          content: prompt,
          ...(imagePath ? { attachments: [{ path: imagePath }] } : {}),
        },
      ],
      stream: !!onResponding,
      // Constrains the model to the §7 shape. `json_object` alone only demands
      // *some* object, and a 1.7B model satisfies that with a bare `{}` — the
      // schema is compiled to a GBNF grammar by llama.cpp, so `values` cannot
      // be omitted. The output is still validated afterwards: a grammar fixes
      // the shape, not the content, and the model is never trusted
      // (CLAUDE.md §7). This also means MedPsy's native `<think>` channel
      // never engages here — the grammar constrains sampling from the first
      // token, before any reasoning tokens could be emitted (see the removal
      // note on `EXTRACTION_JSON_SCHEMA` in `domain/extraction.ts`).
      responseFormat: {
        type: 'json_schema',
        json_schema: { name: 'equipment_extraction', schema },
      },
    });

    if (onResponding) {
      for await (const event of response.events) {
        if (event.type !== 'contentDelta') continue;
        onResponding();
      }
    }

    const text = await response.text;
    // Dev-only visibility into what the model returned. `__DEV__` is false in
    // release builds, so raw output — which can echo the user's words about a
    // site (docs/ai-agent.md §14, CLAUDE.md §15) — never reaches a production
    // log. In the dev client it goes to the Metro terminal / logcat.
    if (__DEV__) {
      console.log(`[ai:${role}] raw model output:\n${text}`);
    }

    const payload = extractJsonPayload(text);
    if (payload === null) {
      if (__DEV__) console.log(`[ai:${role}] no JSON payload could be recovered`);
      throw new UnusableModelOutputError(role);
    }

    const parsed = parseExtraction(payload);
    if (!parsed.ok) {
      if (__DEV__) console.log(`[ai:${role}] unusable payload:`, JSON.stringify(parsed.issues));
      throw new UnusableModelOutputError(role);
    }

    const normalized = normalizeExtraction(parsed.extraction);
    if (__DEV__) {
      console.log(
        `[ai:${role}] parsed:`,
        JSON.stringify({ ...normalized, rejected: parsed.rejected }, null, 2)
      );
    }
    return normalized;
  }

  return {
    async isReady(): Promise<boolean> {
      return loaded.has(MODEL_REGISTRY_NAMES.text);
    },

    modelReadiness,

    async prepare(onProgress?: (progress: PrepareProgress) => void): Promise<void> {
      // Every model the field needs, not just the text one. Loading text alone
      // left vision and Whisper to download on first use — which, offline, is
      // no download at all (services/ai/models.ts, OFFLINE_MODEL_ASSETS).
      const download = options.api.downloadAsset;
      if (download) {
        const readiness = await modelReadiness();
        const totalBytes = readiness.missingBytes;
        let completedBytes = 0;
        for (const asset of readiness.missing) {
          onProgress?.({
            fraction: totalBytes > 0 ? completedBytes / totalBytes : 0,
            downloadedBytes: completedBytes, totalBytes, current: asset.label,
          });
          await download({
            assetSrc: descriptor(asset.name) as unknown as string,
            onProgress: (update) => {
              const downloadedBytes = completedBytes + (update.downloaded ?? 0);
              onProgress?.({
                fraction: totalBytes > 0 ? Math.min(1, downloadedBytes / totalBytes) : 0,
                downloadedBytes, totalBytes, current: asset.label,
              });
            },
          });
          completedBytes += asset.bytes;
        }
        onProgress?.({ fraction: 1, downloadedBytes: totalBytes, totalBytes, current: null });
      }
      // Only the text model is held in memory; the rest stay on disk until the
      // path that needs them runs, which is now a local read, not a download.
      await modelId(MODEL_REGISTRY_NAMES.text);
    },

    async extractFromText(
      request: TextExtractionRequest
    ): Promise<AgentExtraction> {
      let prompt = textExtractionPrompt(request.text, request.targetFields, request.language);
      if (request.language === 'es') {
        const id = await modelId(MODEL_REGISTRY_NAMES.translationEsEn);
        const workingText = await options.api.translate({ modelId: id, text: request.text,
          modelType: 'nmtcpp-translation', stream: false }).text;
        prompt += '\nEnglish working copy (context only; copy field values from the original input):\n' + workingText;
      }
      return complete(MODEL_REGISTRY_NAMES.text, 'text', prompt,
        EXTRACTION_JSON_SCHEMA as unknown as Record<string, unknown>, undefined,
        request.onResponding);
    },

    async extractFromImage(
      request: ImageExtractionRequest
    ): Promise<AgentExtraction> {
      return complete(
        MODEL_REGISTRY_NAMES.vision,
        'vision',
        imageExtractionPrompt(request.targetFields),
        VISION_EXTRACTION_JSON_SCHEMA as unknown as Record<string, unknown>,
        localFilePath(request.imagePath)
      );
    },

    async transcribe(audioPath: string): Promise<string> {
      const id = await modelId(MODEL_REGISTRY_NAMES.speech);
      return options.api.transcribe({ modelId: id, audioChunk: localFilePath(audioPath) });
    },
    async openSpeechSession(onPartial) {
      const id = await modelId(MODEL_REGISTRY_NAMES.speech);
      const session = await options.api.transcribeStream({ modelId: id, metadata: true });
      let cancelled = false;
      const result = (async () => {
        const segments: string[] = [];
        for await (const segment of session) {
          if (cancelled) break;
          if (!segment.text || segment.text.trim() === '[BLANK_AUDIO]') continue;
          if (segment.append || !segments.length) segments.push(segment.text);
          else segments[segments.length - 1] = segment.text;
          onPartial(segments.join(' ').replace(/\s+/g, ' ').trim());
        }
        return cancelled ? '' : segments.join(' ').replace(/\s+/g, ' ').trim();
      })();
      // Attach immediately: a native failure can arrive before stop is pressed.
      void result.catch(() => {});
      void session.stats.catch(() => {});
      return { write: chunk => { if (!cancelled) session.write(chunk); }, result,
        finish: () => { session.end(); return result; },
        cancel: () => { cancelled = true; session.destroy(); } };
    },
  };
}
