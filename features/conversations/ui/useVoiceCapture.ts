import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AiRuntime, SpeechSession } from '../application/ports';
import { startMicrophone, type MicrophoneSession } from '../../../services/capture/microphone';

export type VoiceState =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'listening'; partial: string }
  | { phase: 'finishing'; partial: string }
  | { phase: 'error'; message: string; audioPath?: string };

export function useVoiceCapture(runtime: AiRuntime, onFinal: (text: string, audioPath: string) => Promise<void>, onAudioSaved: (path: string) => Promise<void>) {
  const [state, setState] = useState<VoiceState>({ phase: 'idle' });
  const generation = useRef(0);
  const lock = useRef(false);
  const speech = useRef<SpeechSession | null>(null);
  const mic = useRef<MicrophoneSession | null>(null);
  const partial = useRef('');
  const finalCallback = useRef(onFinal); finalCallback.current = onFinal;
  const audioCallback = useRef(onAudioSaved); audioCallback.current = onAudioSaved;
  const retainedAudio = useRef<string | undefined>(undefined);
  const finishing = useRef(false);

  function cancel() {
    generation.current++;
    mic.current?.cancel(); speech.current?.cancel();
    mic.current = null; speech.current = null; lock.current = false;
    finishing.current = false;
  }
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next !== 'active' && lock.current) {
        cancel(); setState({ phase: 'error', message: 'Se interrumpió la grabación al salir de la aplicación. Vuelve a grabar cuando estés listo.' });
      }
    });
    return () => { subscription.remove(); cancel(); };
  }, []);

  async function start() {
    if (lock.current) return;
    lock.current = true;
    const token = ++generation.current;
    partial.current = '';
    retainedAudio.current = undefined;
    finishing.current = false;
    setState({ phase: 'starting' });
    const fail = () => {
      if (token !== generation.current) return;
      // stop() owns failures once the WAV is being finalized, so its catch can
      // retain the recovery reference instead of losing it to a racing callback.
      if (finishing.current) return;
      cancel(); setState({ phase: 'error', audioPath: retainedAudio.current, message: 'Se interrumpió el audio o la transcripción local. Puedes reintentar o escribir el mensaje.' });
    };
    try {
      if (!runtime.openSpeechSession) throw new Error('Esta versión del motor no admite transcripción en vivo.');
      const session = await runtime.openSpeechSession(text => {
        if (token !== generation.current) return;
        partial.current = text;
        setState(current => current.phase === 'listening' || current.phase === 'finishing' ? { ...current, partial: text } : current);
      });
      if (token !== generation.current) { session.cancel(); return; }
      speech.current = session;
      void session.result.catch(fail);
      const microphone = await startMicrophone(session, fail);
      if (token !== generation.current) { microphone.cancel(); return; }
      mic.current = microphone;
      setState({ phase: 'listening', partial: partial.current });
    } catch (error) {
      if (token !== generation.current) return;
      cancel(); setState({ phase: 'error', message: error instanceof Error ? error.message : 'No se pudo preparar la voz. Revisa los modelos descargados y el micrófono.' });
    }
  }

  async function stop() {
    if (!mic.current || !speech.current || state.phase !== 'listening') return;
    const token = generation.current;
    const microphone = mic.current; mic.current = null;
    const session = speech.current;
    finishing.current = true;
    let audioPath: string | undefined;
    setState({ phase: 'finishing', partial: partial.current });
    try {
      audioPath = await microphone.stop();
      retainedAudio.current = audioPath;
      await audioCallback.current(audioPath);
      const text = (await session.finish()).trim();
      if (token !== generation.current) return;
      if (!text) throw new Error('No se detectó voz. Acércate al micrófono y vuelve a intentarlo.');
      // Capture has ended; the conversation now owns thinking/responding.
      speech.current = null; lock.current = false; finishing.current = false;
      setState({ phase: 'idle' });
      await finalCallback.current(text, audioPath);
    } catch (error) {
      if (token !== generation.current) return;
      cancel(); setState({ phase: 'error', message: error instanceof Error ? error.message : 'No se pudo terminar la transcripción.', audioPath });
    }
  }
  return { state, start, stop, cancel: () => { cancel(); setState({ phase: 'idle' }); } };
}
