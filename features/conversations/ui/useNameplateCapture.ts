import { useEffect, useRef, useState } from 'react';
import type { AiRuntime } from '../application/ports';
import { analyzeNameplate, type NameplateProposal } from '../application/nameplate-review';
import type { ConversationState } from '../domain/conversation';
import type { ExtractedValue } from '../domain/extraction';
import { pickNameplate } from '../../../services/capture/photo';

export type VisionState =
  | { phase: 'idle' }
  | { phase: 'capturing' }
  | { phase: 'processing'; imagePath: string }
  | { phase: 'reviewing'; proposal: NameplateProposal }
  | { phase: 'submitting'; proposal: NameplateProposal }
  | { phase: 'error'; message: string; imagePath?: string; proposal?: NameplateProposal };

export function useNameplateCapture(runtime: AiRuntime, conversation: ConversationState,
  onAccept: (proposal: NameplateProposal, edits: ExtractedValue[], onCommitted: () => void) => Promise<boolean>,
  onStage: (path: string | null) => Promise<void>) {
  const [state, setState] = useState<VisionState>({ phase: 'idle' });
  const generation = useRef(0);
  const lock = useRef(false);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    if (conversation.pendingImagePath && !lock.current && state.phase === 'idle' && conversation.status !== 'saved') {
      setState({ phase: 'error', imagePath: conversation.pendingImagePath, message: 'Hay una fotografía pendiente de revisión. Puedes reintentar su análisis o descartarla.' });
    }
  }, [conversation.pendingImagePath]);
  async function process(imagePath: string, token: number) {
    setState({ phase: 'processing', imagePath });
    try {
      const proposal = await analyzeNameplate(runtime, conversation, imagePath);
      if (token === generation.current) setState({ phase: 'reviewing', proposal });
    } catch (error) {
      if (token === generation.current) setState({ phase: 'error', imagePath, message: error instanceof Error ? error.message : 'No se pudo analizar la foto. Comprueba que el modelo esté descargado.' });
    }
  }
  async function capture(source: 'camera' | 'library') {
    if (lock.current) return;
    lock.current = true; const token = ++generation.current;
    setState({ phase: 'capturing' });
    try {
      const path = await pickNameplate(source);
      if (token !== generation.current) return;
      if (path) {
        await onStage(path);
        if (token === generation.current) await process(path, token);
      } else setState({ phase: 'idle' });
    } catch (error) {
      if (token === generation.current) setState({ phase: 'error', message: error instanceof Error ? error.message : 'No se pudo abrir la cámara.' });
    } finally { lock.current = false; }
  }
  async function accept(edits: ExtractedValue[]) {
    if (lock.current || !('proposal' in state) || !state.proposal) return;
    lock.current = true;
    const proposal = state.proposal; const token = generation.current;
    setState({ phase: 'submitting', proposal });
    try {
      if (!await onAccept(proposal, edits, () => { if (token === generation.current) setState({ phase: 'idle' }); })) throw new Error('No se pudo incorporar la revisión. Los cambios siguen aquí para reintentar.');
      if (token === generation.current) setState({ phase: 'idle' });
    } catch (error) {
      if (token === generation.current) setState({ phase: 'error', proposal, message: error instanceof Error ? error.message : 'No se pudo enviar la revisión.' });
    } finally { lock.current = false; }
  }
  return { state, capture, accept,
    async cancel() {
      if (state.phase === 'submitting') return;
      const token = ++generation.current;
      try { await onStage(null); if (token === generation.current) setState({ phase: 'idle' }); }
      catch { if (token === generation.current) setState({ phase: 'error', message: 'No se pudo descartar la foto pendiente. Reintenta cuando el almacenamiento esté disponible.' }); }
    },
    async retry() {
      if (lock.current || state.phase !== 'error' || !state.imagePath) return;
      lock.current = true; try { await process(state.imagePath, ++generation.current); } finally { lock.current = false; }
    },
  };
}
