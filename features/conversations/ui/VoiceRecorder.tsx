import { AppButton as Button } from '../../../components/ui/AppButton';
import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { retainArtifact } from '../../../services/capture/artifacts';

export function VoiceRecorder({ disabled, onRecorded, onRecordingChange }: {
  disabled: boolean; onRecorded: (uri: string) => Promise<boolean>; onRecordingChange: (active: boolean) => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const locked = useRef(false);
  const recording = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next !== 'active' && recording.current) void stop();
    });
    return () => { subscription.remove(); void setAudioModeAsync({ allowsRecording: false }); };
  }, [recorder]);
  async function stop() {
    if (locked.current) return;
    locked.current = true; setWorking(true);
    try {
      await recorder.stop(); recording.current = false;
      if (recorder.uri) setPending(retainArtifact(recorder.uri, 'audio'));
    } catch { setError('No se pudo terminar la grabación. Inténtalo de nuevo.'); }
    finally {
      recording.current = false; onRecordingChange(false);
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      locked.current = false; setWorking(false);
    }
  }
  async function start() {
    if (locked.current) return;
    locked.current = true; setWorking(true); setError('');
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) { setError('Permite el micrófono en Ajustes para grabar.'); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync(); recorder.record();
      recording.current = true; onRecordingChange(true);
    } catch { setError('No se pudo iniciar el micrófono.'); await setAudioModeAsync({ allowsRecording: false }).catch(() => {}); }
    finally { locked.current = false; setWorking(false); }
  }
  return <View style={{ paddingHorizontal: 16, gap: 4 }}>
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    {pending ? <Button title="Transcribir audio grabado" disabled={disabled || working}
      onPress={() => { void onRecorded(pending).then(ok => { if (ok) setPending(null); }); }} /> :
      <Button title={state.isRecording ? `Detener grabación (${Math.round(state.durationMillis / 1000)} s)` : 'Grabar voz'}
        disabled={working || (disabled && !state.isRecording)} onPress={() => void (state.isRecording ? stop() : start())} />}
  </View>;
}
