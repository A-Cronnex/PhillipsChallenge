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
    // Unlike `isReady`, this does resolve the real runtime: telling the user
    // whether the weights are on the device requires asking QVAC's cache. That
    // imports the SDK but downloads nothing and loads no weights, and the
    // screen has already painted by the time the UI asks.
    modelReadiness: async () => {
      const current = await get();
      if (!current.modelReadiness) throw new Error('El motor no informa el estado de los modelos.');
      return current.modelReadiness();
    },
    prepare: async onProgress => (await get()).prepare(onProgress),
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
