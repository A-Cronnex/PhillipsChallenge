/**
 * Composition root for local inference.
 *
 * Kept out of `lib/container.ts` on purpose: the database opens on every
 * launch, whereas `@qvac/sdk` pulls in the Bare runtime and model weights and
 * must only be touched when the user actually opens the agent.
 */
import type { AiRuntime } from '../features/conversations/application/ports';

let runtime: AiRuntime | null = null;

/**
 * Builds the QVAC-backed runtime.
 *
 * The SDK and the model registry are imported lazily so that importing this
 * module — which the router does at startup — does not initialise QVAC.
 */
export async function getAiRuntime(): Promise<AiRuntime> {
  if (runtime) return runtime;

  const [sdk, registry, { createQvacRuntime }] = await Promise.all([
    import('@qvac/sdk'),
    import('@qvac/inference/models'),
    import('../services/ai/qvac-runtime'),
  ]);

  runtime = createQvacRuntime({
    api: sdk as never,
    catalog: registry as never,
  });
  return runtime;
}

/** Test/teardown helper. */
export function resetAiRuntime(): void {
  runtime = null;
}
