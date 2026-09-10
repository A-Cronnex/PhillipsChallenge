/**
 * QVAC implementation of the `AiRuntime` port.
 *
 * This is the only file that imports `@qvac/sdk`. Everything above it works
 * against the port, which is what allows the agent's rules to be tested
 * off-device — QVAC does not run on an emulator (docs/ai-agent.md §12).
 *
 * The API used here was verified against the installed `@qvac/sdk` 0.19.0:
 * `loadModel({ modelSrc })`, `completion({ modelId, history, stream:false })`
 * with `attachments: [{ path }]` for images, and `transcribe({ modelId, ... })`.
 * CLAUDE.md §18 lists the exact QVAC API as unresolved, so anything here that
 * turns out to differ on a real device is expected to change — see
 * docs/ai-agent-implementation.md §5.
 *
 * Security (docs/ai-agent.md §14): no raw audio, no image bytes and no prompt
 * contents are logged; only model ids and failure messages surface.
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
 * Declared structurally so the adapter can be exercised against a stub in
 * tests without importing the native SDK, which cannot load under Jest.
 */
export interface QvacApi {
  loadModel(options: { modelSrc: unknown }): Promise<string>;
  completion(params: {
    modelId: string;
    history: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
      attachments?: Array<{ path: string }>;
    }>;
    stream: false;
    responseFormat?: { type: 'json_object' };
  }): Promise<{ text: string }>;
  transcribe(params: { modelId: string; path: string }): Promise<string>;
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

  function descriptor(name: string): unknown {
    const entry = options.catalog[name];
    if (entry === undefined) throw new ModelDescriptorMissingError(name);
    return entry;
  }

  async function modelId(name: string): Promise<string> {
    const existing = loaded.get(name);
    if (existing) return existing;
    const id = await options.api.loadModel({ modelSrc: descriptor(name) });
    loaded.set(name, id);
    return id;
  }

  async function complete(
    name: string,
    role: string,
    prompt: string,
    imagePath?: string
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
      stream: false,
      // Constrains the model toward the §7 shape. The output is still
      // validated afterwards — the model is never trusted (CLAUDE.md §7).
      responseFormat: { type: 'json_object' },
    });

    const payload = extractJsonPayload(response.text);
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
      // NOTE: the Spanish→English translation bridge described in
      // docs/tech-stack.md §7.2 is NOT applied here yet. See
      // docs/ai-agent-implementation.md §4 — MedPsy is prompted directly in
      // the user's language.
      //
      // Either way the storage rule in §7.2 holds without depending on the
      // bridge: the prompt asks for verbatim values in the user's language,
      // and `features/conversations/domain/language.ts` enforces it against
      // what the user actually said before anything is recorded.
      return complete(
        MODEL_REGISTRY_NAMES.text,
        'text',
        textExtractionPrompt(request.text, request.targetFields, request.language)
      );
    },

    async extractFromImage(
      request: ImageExtractionRequest
    ): Promise<AgentExtraction> {
      return complete(
        MODEL_REGISTRY_NAMES.vision,
        'vision',
        imageExtractionPrompt(request.targetFields, request.language),
        request.imagePath
      );
    },

    async transcribe(audioPath: string): Promise<string> {
      const id = await modelId(MODEL_REGISTRY_NAMES.speech);
      return options.api.transcribe({ modelId: id, path: audioPath });
    },
  };
}
