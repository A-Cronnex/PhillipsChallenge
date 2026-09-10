import { useCallback, useEffect, useRef, useState } from 'react';
import { getRepositories } from '../../../lib/container';
import { newId } from '../../../lib/id';
import { submitPhoto, submitText, submitVoice, type TurnOutcome } from '../application/conversation-orchestrator';
import type { AiRuntime } from '../application/ports';
import { addTurn, startConversation, type ConversationState } from '../domain/conversation';
import { acceptsMorePhotos } from '../domain/vision-flow';

export type RuntimePhase = 'idle' | 'preparing' | 'ready' | 'unavailable';
export interface UseConversationOptions { runtime: AiRuntime; userId: string; now?: () => Date }
const clock = () => new Date();

export function useConversation({ runtime, userId, now = clock }: UseConversationOptions) {
  const [runtimePhase, setRuntimePhase] = useState<RuntimePhase>('idle');
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [conversation, setConversation] = useState(() => startConversation(newId(), userId, now().toISOString()));
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const lock = useRef(false);
  const restoreFailed = useRef(false);
  useEffect(() => {
    let active = true;
    void getRepositories().then(r => r.conversations.latest(userId)).then(state => {
      if (active && state) setConversation(state);
    }).catch(() => {
      restoreFailed.current = true;
      if (active) setError('No se pudo recuperar la conversación. Vuelve a abrir la aplicación para reintentar.');
    }).finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, [userId]);

  // The runtime is a process-wide singleton (lib/ai-runtime.ts), so models
  // loaded earlier in this session are still loaded when this screen is
  // mounted again — for instance after going back to the capture launcher and
  // opening the agent a second time. Asking spares the user a load gate that
  // has nothing left to load. A failure here is not reported: the gate is the
  // fallback, and pressing it surfaces any real problem.
  useEffect(() => {
    let active = true;
    void runtime.isReady()
      .then(ready => {
        if (active && ready) setRuntimePhase(phase => (phase === 'idle' ? 'ready' : phase));
      })
      .catch(() => {});
    return () => { active = false; };
  }, [runtime]);

  const checkpoint = useCallback(async (state: ConversationState) => {
    setConversation(state);
    await (await getRepositories()).conversations.save(state);
  }, []);
  const prepare = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setRuntimePhase('preparing'); setRuntimeError(null);
    try { await runtime.prepare(); setRuntimePhase('ready'); }
    catch { setRuntimeError('No se pudo cargar QVAC. Comprueba conexión para la primera descarga, espacio libre y compatibilidad del dispositivo.'); setRuntimePhase('unavailable'); }
    finally { lock.current = false; }
  }, [runtime]);

  async function run(action: () => Promise<TurnOutcome>): Promise<boolean> {
    if (lock.current || restoring || restoreFailed.current || conversation.status === 'saved') return false;
    lock.current = true; setBusy(true); setError(null); setWarning(null);
    try {
      const outcome = await action();
      if (outcome.status === 'ok') {
        const state = addTurn(outcome.result.conversation, { role: 'agent', text: outcome.result.message, source: 'text', at: now().toISOString() });
        await checkpoint(state);
        if (outcome.result.rejected.length) setWarning('Algunos valores propuestos no superaron la validación. Revisa los campos antes de guardar.');
      } else {
        await checkpoint(outcome.conversation);
        setError('No se pudo interpretar la entrada. Se conservó para reintentar o revisar manualmente.');
      }
      return outcome.status === 'ok';
    } catch {
      setError('No se pudo completar el turno o guardar sus cambios. Conserva esta pantalla y reintenta.');
      return false;
    } finally { lock.current = false; setBusy(false); }
  }
  const deps = { runtime, now, language: 'es' as const, checkpoint };
  return {
    conversation, runtimePhase, runtimeError, busy: busy || restoring || restoreFailed.current, error, warning, prepare,
    sendText: (text: string) => run(() => submitText(conversation, text, deps)),
    sendPhoto: (path: string) => run(() => submitPhoto(conversation, path, deps)),
    sendVoice: (path: string) => run(() => submitVoice(conversation, path, deps)),
    retryLast() {
      const turn = [...conversation.turns].reverse().find(item => item.role === 'user');
      if (!turn) return Promise.resolve(false);
      if (turn.source === 'image' && turn.reference) return run(() => submitPhoto(conversation, turn.reference!, deps));
      if (turn.source === 'voice' && turn.reference) return run(() => submitVoice(conversation, turn.reference!, deps));
      return run(() => submitText(conversation, turn.text, deps));
    },
    markSaved: () => setConversation(state => ({ ...state, status: 'saved' })),
    async newConversation() {
      if (lock.current) return;
      lock.current = true; setBusy(true);
      try { await checkpoint(startConversation(newId(), userId, now().toISOString())); setError(null); }
      catch { setError('No se pudo guardar la nueva conversación.'); }
      finally { lock.current = false; setBusy(false); }
    },
    cameraOffered: conversation.pendingField ? acceptsMorePhotos(conversation.pendingField) : true,
  };
}
