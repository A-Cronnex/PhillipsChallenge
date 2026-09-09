import { useCallback, useMemo, useState } from 'react';

import { newId } from '../../../lib/id';
import {
  submitPhoto,
  submitText,
  submitVoice,
  type TurnOutcome,
} from '../application/conversation-orchestrator';
import type { AiRuntime } from '../application/ports';
import {
  addTurn,
  startConversation,
  type ConversationState,
} from '../domain/conversation';
import { acceptsMorePhotos } from '../domain/vision-flow';

export type RuntimePhase = 'idle' | 'preparing' | 'ready' | 'unavailable';

export interface UseConversationOptions {
  runtime: AiRuntime;
  userId: string;
  now?: () => Date;
}

/**
 * Screen state for the capture conversation.
 *
 * Holds no rules of its own: every decision about what the agent asks next
 * comes from the orchestrator and the §3a flow. This hook only turns outcomes
 * into things a screen can render.
 */
export function useConversation({
  runtime,
  userId,
  now = () => new Date(),
}: UseConversationOptions) {
  const [runtimePhase, setRuntimePhase] = useState<RuntimePhase>('idle');
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationState>(() =>
    startConversation(newId(), userId, now().toISOString())
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deps = useMemo(
    () => ({ runtime, now, language: 'es' as const }),
    [runtime, now]
  );

  const prepare = useCallback(async () => {
    setRuntimePhase('preparing');
    setRuntimeError(null);
    try {
      await runtime.prepare();
      setRuntimePhase('ready');
    } catch (caught) {
      // Loading models can fail for reasons the user can act on (storage,
      // memory), so the message is surfaced rather than swallowed.
      setRuntimeError(caught instanceof Error ? caught.message : String(caught));
      setRuntimePhase('unavailable');
    }
  }, [runtime]);

  const handle = useCallback((outcome: TurnOutcome) => {
    if (outcome.status === 'ok') {
      setConversation(
        addTurn(outcome.result.conversation, {
          role: 'agent',
          text: outcome.result.message,
          source: 'text',
          at: new Date().toISOString(),
        })
      );
      setError(null);
      return;
    }

    // docs/ai-agent.md §13: keep the conversation, inform the user, allow
    // retry. The failing turn stays in the transcript.
    setConversation(outcome.conversation);
    setError(
      outcome.status === 'inference_failed'
        ? outcome.reason
        : 'El modelo devolvió una respuesta que no se pudo interpretar.'
    );
  }, []);

  const run = useCallback(
    async (action: () => Promise<TurnOutcome>) => {
      setBusy(true);
      try {
        handle(await action());
      } finally {
        setBusy(false);
      }
    },
    [handle]
  );

  return {
    conversation,
    runtimePhase,
    runtimeError,
    busy,
    error,
    prepare,
    sendText: useCallback(
      (text: string) => run(() => submitText(conversation, text, deps)),
      [conversation, deps, run]
    ),
    sendPhoto: useCallback(
      (path: string) => run(() => submitPhoto(conversation, path, deps)),
      [conversation, deps, run]
    ),
    sendVoice: useCallback(
      (path: string) => run(() => submitVoice(conversation, path, deps)),
      [conversation, deps, run]
    ),
    /** Whether the camera should stay offered for the field being asked about. */
    cameraOffered: conversation.pendingField
      ? acceptsMorePhotos(conversation.pendingField)
      : true,
  };
}
