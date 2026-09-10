import type { ModelDescriptor } from '@qvac/inference/surface';
/** SDK adapter. Runtime imports live in lib/ai-runtime.ts; these imports are type-only.
 * Verified against installed SDK 0.19 declarations/examples. Hardware behavior still needs a device.
 */
import type {
  AiRuntime,
  ImageExtractionRequest,
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
import { MODEL_REGISTRY_NAMES } from './models';

/**
 * The subset of `@qvac/sdk` this adapter uses.
 *
 * Derived from the installed SDK to catch API drift at compilation, with no native import in Jest.
 */
export type QvacApi = Pick<typeof import('@qvac/sdk'), 'loadModel' | 'completion' | 'transcribe' | 'transcribeStream' | 'translate'>;

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
    const payload = extractJsonPayload(await response.text);
    if (payload === null) throw new UnusableModelOutputError(role);

    const parsed = parseExtraction(payload);
    if (!parsed.ok) throw new UnusableModelOutputError(role);

    return normalizeExtraction(parsed.extraction);
  }

  return {
    async isReady(): Promise<boolean> {
      return loaded.has(MODEL_REGISTRY_NAMES.text);
    },

    async prepare(): Promise<void> {
      // Text first: it is the model every path needs. Vision and speech are
      // loaded lazily on first use so a text-only capture does not pay for
      // weights it will never touch.
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
