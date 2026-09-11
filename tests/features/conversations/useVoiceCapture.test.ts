import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useVoiceCapture } from '../../../features/conversations/ui/useVoiceCapture';
import { startMicrophone } from '../../../services/capture/microphone';
import type { AiRuntime, SpeechSession } from '../../../features/conversations/application/ports';

jest.mock('../../../services/capture/microphone', () => ({ startMicrophone: jest.fn() }));
function setup() {
  let partial: (text: string) => void = () => {};
  let finish: (text: string) => void = () => {};
  const result = new Promise<string>(resolve => { finish = resolve; });
  const session: SpeechSession = { write: jest.fn(), result, finish: jest.fn(() => result), cancel: jest.fn() };
  const mic = { stop: jest.fn(async () => '/audio.wav'), cancel: jest.fn() };
  jest.mocked(startMicrophone).mockResolvedValue(mic);
  const runtime = { openSpeechSession: jest.fn(async (callback: (text: string) => void) => { partial = callback; return session; }) } as unknown as AiRuntime;
  const final = jest.fn(async () => {}); const checkpoint = jest.fn(async () => {});
  const hook = renderHook(() => useVoiceCapture(runtime, final, checkpoint));
  return { ...hook, runtime, session, mic, final, checkpoint, partial: (text: string) => partial(text), finish: (text: string) => finish(text) };
}
afterEach(() => jest.clearAllMocks());
test('shows real partials, checkpoints audio, then automatically delivers one final transcript', async () => {
  const test = setup();
  await act(async () => { await test.result.current.start(); });
  expect(test.result.current.state.phase).toBe('listening');
  act(() => test.partial('dos'));
  expect(test.result.current.state).toEqual({ phase: 'listening', partial: 'dos' });
  act(() => test.partial('dos monitores'));
  let stopped: Promise<void>;
  act(() => { stopped = test.result.current.stop(); });
  await waitFor(() => expect(test.checkpoint).toHaveBeenCalledWith('/audio.wav'));
  expect(test.final).not.toHaveBeenCalled();
  await act(async () => { test.finish('dos monitores Philips'); await stopped!; });
  expect(test.final).toHaveBeenCalledTimes(1);
  expect(test.final).toHaveBeenCalledWith('dos monitores Philips', '/audio.wav');
  expect(test.result.current.state.phase).toBe('idle');
});
test('does not send empty audio and retains a path for retry', async () => {
  const test = setup();
  await act(async () => { await test.result.current.start(); });
  await act(async () => { test.finish(' '); await test.result.current.stop(); });
  expect(test.final).not.toHaveBeenCalled();
  expect(test.result.current.state).toMatchObject({ phase: 'error', audioPath: '/audio.wav' });
});
test('cancellation discards late partial and final callbacks without sending', async () => {
  const test = setup();
  await act(async () => { await test.result.current.start(); });
  act(() => test.result.current.cancel());
  await act(async () => { test.partial('late'); test.finish('late'); });
  expect(test.mic.cancel).toHaveBeenCalled();
  expect(test.session.cancel).toHaveBeenCalled();
  expect(test.final).not.toHaveBeenCalled();
  expect(test.result.current.state.phase).toBe('idle');
});
test('unmount releases the recorder and native stream', async () => {
  const test = setup();
  await act(async () => { await test.result.current.start(); });
  test.unmount();
  expect(test.mic.cancel).toHaveBeenCalled(); expect(test.session.cancel).toHaveBeenCalled();
});
test('microphone denial cancels the already-opened stream and permits retry', async () => {
  const test = setup();
  jest.mocked(startMicrophone).mockRejectedValueOnce(new Error('Permiso de micrófono denegado'));
  await act(async () => { await test.result.current.start(); });
  expect(test.result.current.state.phase).toBe('error');
  expect(test.session.cancel).toHaveBeenCalled();
  await act(async () => { await test.result.current.start(); });
  expect(test.result.current.state.phase).toBe('listening');
});

test('a stalled microphone times out, releases a late recorder and allows retry', async () => {
  jest.useFakeTimers();
  const test = setup();
  try {
    let resolveMic!: (value: typeof test.mic) => void;
    jest.mocked(startMicrophone).mockReturnValueOnce(new Promise(resolve => { resolveMic = resolve; }));
    let starting!: Promise<void>;
    await act(async () => { starting = test.result.current.start(); });
    expect(test.result.current.state).toEqual({ phase: 'starting', step: 'microphone' });
    act(() => jest.advanceTimersByTime(20_000));
    expect(test.result.current.state).toMatchObject({ phase: 'error', message: expect.stringContaining('micrófono no respondió') });
    expect(test.session.cancel).toHaveBeenCalled();
    await act(async () => { resolveMic(test.mic); await starting; });
    expect(test.mic.cancel).toHaveBeenCalled();
    expect(test.final).not.toHaveBeenCalled();
    await act(async () => { await test.result.current.start(); });
    expect(test.result.current.state.phase).toBe('listening');
  } finally { test.unmount(); jest.useRealTimers(); }
});

test('model preparation times out without opening the microphone or accepting a late stream', async () => {
  jest.useFakeTimers();
  const test = setup();
  try {
    let resolveSpeech!: (value: SpeechSession) => void;
    jest.mocked(test.runtime.openSpeechSession!).mockReturnValueOnce(new Promise(resolve => { resolveSpeech = resolve; }));
    let starting!: Promise<void>;
    act(() => { starting = test.result.current.start(); });
    expect(test.result.current.state).toEqual({ phase: 'starting', step: 'model' });
    act(() => jest.advanceTimersByTime(120_000));
    expect(test.result.current.state.phase).toBe('error');
    await act(async () => { resolveSpeech(test.session); await starting; });
    expect(test.session.cancel).toHaveBeenCalled();
    expect(startMicrophone).not.toHaveBeenCalled();
  } finally { test.unmount(); jest.useRealTimers(); }
});
