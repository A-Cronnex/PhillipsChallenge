import type { AiRuntime } from '../../features/conversations/application/ports';

/** Paint the conversation before touching native inference. No automatic model downloads. */
export function deferredRuntime(resolve: () => Promise<AiRuntime>): AiRuntime {
  let runtime: AiRuntime | undefined;
  let pending: Promise<AiRuntime> | undefined;
  function get() {
    if (runtime) return Promise.resolve(runtime);
    return pending ??= resolve().then(value => { runtime = value; return value; }).finally(() => { pending = undefined; });
  }
  return {
    isReady: () => runtime?.isReady() ?? Promise.resolve(false),
    prepare: async () => (await get()).prepare(),
    extractFromText: async request => (await get()).extractFromText(request),
    extractFromImage: async request => (await get()).extractFromImage(request),
    transcribe: async path => (await get()).transcribe(path),
    openSpeechSession: async callback => {
      const current = await get();
      if (!current.openSpeechSession) throw new Error('El motor no admite voz en vivo.');
      return current.openSpeechSession(callback);
    },
  };
}
