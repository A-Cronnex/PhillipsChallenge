import { useCallback, useEffect, useRef, useState } from 'react';
import { getRepositories } from '../../../lib/container';
import { newId } from '../../../lib/id';
import { submitText, submitVoice, submitVoiceTranscript, submitReviewedPhoto, type TurnOutcome } from '../application/conversation-orchestrator';
import type { AiRuntime, AgentActivity } from '../application/ports';
import type { NameplateProposal } from '../application/nameplate-review';
import type { ExtractedValue } from '../domain/extraction';
import { addTurn, startConversation, type ConversationState } from '../domain/conversation';
import { acceptsMorePhotos } from '../domain/vision-flow';
import { useResponseDelivery } from './useResponseDelivery';

export type RuntimePhase = 'idle' | 'preparing' | 'ready' | 'unavailable';
export interface UseConversationOptions { runtime: AiRuntime; userId: string; now?: () => Date }
const clock = () => new Date();

export function useConversation({ runtime, userId, now = clock }: UseConversationOptions) {
  const response = useResponseDelivery();
  const [runtimePhase, setRuntimePhase] = useState<RuntimePhase>('idle');
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [conversation, setConversation] = useState(() => startConversation(newId(), userId, now().toISOString()));
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<AgentActivity>('idle');
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
    await (await getRepositories()).conversations.save(state);
    setConversation(state);
  }, []);
  const prepare = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setRuntimePhase('preparing'); setRuntimeError(null);
    try { await runtime.prepare(); setRuntimePhase('ready'); }
    catch { setRuntimeError('No se pudo cargar QVAC. Comprueba conexión para la primera descarga, espacio libre y compatibilidad del dispositivo.'); setRuntimePhase('unavailable'); }
    finally { lock.current = false; }
  }, [runtime]);

  async function run(action: () => Promise<TurnOutcome>, onCommitted?: () => void): Promise<boolean> {
    if (lock.current || restoring || restoreFailed.current || conversation.status === 'saved') return false;
    lock.current = true; setBusy(true); setActivity('thinking'); setError(null); setWarning(null);
    try {
      const outcome = await action();
      if (outcome.status === 'ok') {
        setActivity('responding');
        const state = addTurn(outcome.result.conversation, { role: 'agent', text: outcome.result.message, source: 'text',
          at: now().toISOString(), capturedSummary: outcome.result.capturedSummary });
        await response.reveal(state.turns.length - 1, outcome.result.message, async () => { await checkpoint(state); onCommitted?.(); });
        if (outcome.result.rejected.length) setWarning('Algunos valores propuestos no superaron la validación. Revisa los campos antes de guardar.');
      } else {
        await checkpoint(outcome.conversation);
        setError('No se pudo interpretar la entrada. Se conservó para reintentar o revisar manualmente.');
      }
      return outcome.status === 'ok';
    } catch {
      setError('No se pudo completar el turno o guardar sus cambios. Conserva esta pantalla y reintenta.');
      return false;
    } finally { lock.current = false; setBusy(false); setActivity('idle'); }
  }
  const deps = { runtime, now, language: 'es' as const, checkpoint,
    onResponding: () => setActivity('responding') };
  return {
    conversation, runtimePhase, runtimeError, activity, delivery: response.delivery, finishDelivery: response.complete,
    busy: busy || restoring || restoreFailed.current, error, warning, prepare,
    sendText: (text: string) => run(() => submitText(conversation, text, deps)),
    acceptPhoto: (proposal: NameplateProposal, edits: ExtractedValue[], onCommitted?: () => void) => run(() => submitReviewedPhoto(conversation, proposal, edits, deps), onCommitted),
    sendVoiceTranscript: (text: string, path: string) => run(() => submitVoiceTranscript(conversation, text, path, deps)),
    retainVoiceInput: (path: string) => checkpoint(addTurn(conversation, { role: 'user', source: 'voice',
      reference: path, text: '[audio pendiente de transcripción]', at: now().toISOString() })),
    retainPhotoInput: (path: string | null) => checkpoint({ ...conversation, pendingImagePath: path }),
    sendVoice: (path: string) => run(() => submitVoice(conversation, path, deps)),
    retryLast() {
      const turn = [...conversation.turns].reverse().find(item => item.role === 'user');
      if (!turn) return Promise.resolve(false);
      // Photo retries stay in the human review flow; never bypass confirmation.
      if (turn.source === 'image') return Promise.resolve(false);
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
