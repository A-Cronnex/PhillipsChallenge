import { pcm16, startMicrophone } from '../../services/capture/microphone';
import { AudioManager, AudioRecorder } from 'react-native-audio-api';
import { retainArtifact } from '../../services/capture/artifacts';
import type { SpeechSession } from '../../features/conversations/application/ports';
jest.mock('../../services/capture/artifacts', () => ({ retainArtifact: jest.fn() }));
jest.mock('react-native-audio-api', () => ({
  AudioManager: {
    checkRecordingPermissions: jest.fn(), requestRecordingPermissions: jest.fn(),
    setAudioSessionOptions: jest.fn(), setAudioSessionActivity: jest.fn(async () => true),
  },
  AudioRecorder: jest.fn(), FileFormat: { Wav: 'wav' },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(AudioManager.checkRecordingPermissions).mockResolvedValue('Granted');
});

test('already granted permission starts recording without requesting it again and retains the WAV', async () => {
  const recorder = {
    enableFileOutput: jest.fn(() => ({ status: 'success' })),
    onAudioReady: jest.fn(() => ({ status: 'success' })), onError: jest.fn(),
    start: jest.fn(() => ({ status: 'success' })),
    stop: jest.fn(() => ({ status: 'success', paths: ['/cache/recording.wav'] })),
    clearOnAudioReady: jest.fn(), clearOnError: jest.fn(),
  };
  jest.mocked(AudioRecorder).mockImplementation(() => recorder as unknown as AudioRecorder);
  jest.mocked(retainArtifact).mockReturnValue('/private/recording.wav');
  const speech = { write: jest.fn() } as unknown as SpeechSession;
  const microphone = await startMicrophone(speech, jest.fn());
  expect(AudioManager.requestRecordingPermissions).not.toHaveBeenCalled();
  expect(recorder.start).toHaveBeenCalledTimes(1);
  // Exercise the real callback's PCM conversion and delivery, not only start().
  const callback = (recorder.onAudioReady.mock.calls[0] as unknown as [unknown, (event: unknown) => void])[1];
  callback({ buffer: { sampleRate: 16000, numberOfChannels: 1, getChannelData: () => new Float32Array([0.5, -0.5]) } });
  expect(speech.write).toHaveBeenCalledWith(pcm16(new Float32Array([0.5, -0.5])));
  await expect(microphone.stop()).resolves.toBe('/private/recording.wav');
  expect(retainArtifact).toHaveBeenCalledWith('file:///cache/recording.wav', 'audio');
  expect(recorder.clearOnAudioReady).toHaveBeenCalled();
});

test('requests missing permission and refuses recording when denied', async () => {
  jest.mocked(AudioManager.checkRecordingPermissions).mockResolvedValue('Undetermined');
  jest.mocked(AudioManager.requestRecordingPermissions).mockResolvedValue('Denied');
  await expect(startMicrophone({} as SpeechSession, jest.fn())).rejects.toThrow('Permite el acceso');
  expect(AudioManager.requestRecordingPermissions).toHaveBeenCalledTimes(1);
  expect(AudioRecorder).not.toHaveBeenCalled();
});
test('converts and clips microphone float samples to signed little-endian PCM without changing duration', () => {
  const bytes = pcm16(new Float32Array([-2, -1, 0, 0.5, 1, 2]));
  expect(bytes.length).toBe(12);
  const view = new DataView(bytes.buffer);
  expect(Array.from({ length: 6 }, (_, i) => view.getInt16(i * 2, true))).toEqual([-32768, -32768, 0, 16384, 32767, 32767]);
  expect([...bytes.slice(6, 8)]).toEqual([0, 64]);
});
