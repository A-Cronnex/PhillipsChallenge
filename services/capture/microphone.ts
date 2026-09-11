import type { SpeechSession } from '../../features/conversations/application/ports';
import { retainArtifact } from './artifacts';

export interface MicrophoneSession { stop(): Promise<string>; cancel(): void }

export function pcm16(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(index * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}

/** Native I/O stays behind a service, loaded only when the user chooses voice. */
export async function startMicrophone(speech: SpeechSession, onError: () => void): Promise<MicrophoneSession> {
  const { AudioManager, AudioRecorder, FileFormat } = require('react-native-audio-api') as typeof import('react-native-audio-api');
  // Android's native request always opens a permission round-trip, even when
  // already granted. Check first so repeat recordings need no activity callback.
  if (await AudioManager.checkRecordingPermissions() !== 'Granted' &&
      await AudioManager.requestRecordingPermissions() !== 'Granted') throw new Error('Permite el acceso al micrófono en los ajustes del dispositivo.');
  AudioManager.setAudioSessionOptions({ iosCategory: 'record', iosMode: 'default', iosOptions: [] });
  if (!await AudioManager.setAudioSessionActivity(true)) throw new Error('El micrófono no está disponible.');
  const recorder = new AudioRecorder();
  let stopped = false;
  const release = () => {
    recorder.clearOnAudioReady(); recorder.clearOnError();
    void AudioManager.setAudioSessionActivity(false).catch(() => {});
  };
  try {
    const file = recorder.enableFileOutput({ format: FileFormat.Wav, channelCount: 1 });
    if (file.status === 'error') throw new Error('No se pudo preparar el archivo de audio.');
    const callback = recorder.onAudioReady({ sampleRate: 16000, bufferLength: 3200, channelCount: 1 }, ({ buffer }) => {
      if (stopped) return;
      // Refuse an unexpected format rather than feeding distorted audio to Whisper.
      if (buffer.sampleRate !== 16000 || buffer.numberOfChannels !== 1) { onError(); return; }
      try { speech.write(pcm16(buffer.getChannelData(0))); } catch { onError(); }
    });
    if (callback.status === 'error') throw new Error('No se pudo preparar la transcripción en vivo.');
    recorder.onError(onError);
    const result = recorder.start();
    if (result.status === 'error') throw new Error('No se pudo iniciar el micrófono.');
  } catch (error) {
    stopped = true;
    if (recorder.isRecording()) recorder.stop();
    release(); throw error;
  }
  return {
    async stop() {
      if (stopped) throw new Error('La grabación ya terminó.');
      const result = recorder.stop();
      stopped = true; release();
      if (result.status === 'error' || !result.paths[0]) throw new Error('No se pudo conservar el audio.');
      const path = result.paths[0];
      return retainArtifact(path.startsWith('file://') ? path : `file://${path}`, 'audio');
    },
    cancel() { if (!stopped) { stopped = true; recorder.stop(); release(); } },
  };
}
