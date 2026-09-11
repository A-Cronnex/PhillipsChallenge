import { act, renderHook } from '@testing-library/react-native';
import { useNameplateCapture } from '../../../features/conversations/ui/useNameplateCapture';
import { startConversation } from '../../../features/conversations/domain/conversation';
import { pickNameplate, retainPhoto } from '../../../services/capture/photo';
import type { AiRuntime } from '../../../features/conversations/application/ports';

jest.mock('../../../services/capture/photo', () => ({ pickNameplate: jest.fn(), retainPhoto: jest.fn() }));
const photo = { uri: '/cache/camera.jpg', width: 1000, height: 800 };
function setup() {
  const state = startConversation('c', 'u', '2026-09-10T00:00:00Z');
  const extractFromImage = jest.fn(async () => ({ nameplate: 'detected', values: [{ field: 'brand', value: 'Test brand', status: 'confirmed', confidence: 'high' }] }));
  const runtime = { extractFromImage } as unknown as AiRuntime;
  const stage = jest.fn(async (_path: string | null) => {});
  const accept = jest.fn(async () => true);
  const hook = renderHook(() => useNameplateCapture(runtime, state, accept, stage));
  return { ...hook, state, extractFromImage, stage, accept };
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(retainPhoto).mockReturnValue('/private/camera.jpg');
});
test('opening the camera does not launch ImagePicker or infer; using a photo checkpoints before inference', async () => {
  const test = setup();
  await act(async () => { await test.result.current.capture('camera'); });
  expect(test.result.current.state).toEqual({ phase: 'capturing', source: 'camera' });
  expect(pickNameplate).not.toHaveBeenCalled();
  expect(test.extractFromImage).not.toHaveBeenCalled();
  await act(async () => { await test.result.current.captured(photo); });
  expect(test.stage).toHaveBeenCalledWith('/private/camera.jpg');
  expect(test.stage.mock.invocationCallOrder[0]).toBeLessThan(test.extractFromImage.mock.invocationCallOrder[0]);
  expect(test.result.current.state.phase).toBe('reviewing');
  expect(test.state.fields.brand.value).toBeNull();
  expect(test.accept).not.toHaveBeenCalled();
});
test('failed checkpoint preserves the retained photo for retry and does not run inference prematurely', async () => {
  const test = setup(); test.stage.mockRejectedValueOnce(new Error('disk busy'));
  await act(async () => { await test.result.current.capture('camera'); });
  await act(async () => { await test.result.current.captured(photo); });
  expect(test.result.current.state).toMatchObject({ phase: 'error', imagePath: '/private/camera.jpg' });
  expect(test.extractFromImage).not.toHaveBeenCalled();
  await act(async () => { await test.result.current.retry(); });
  expect(test.stage).toHaveBeenCalledTimes(2);
  expect(test.result.current.state.phase).toBe('reviewing');
});
test('canceling a pending gallery permits camera capture and ignores the late picker', async () => {
  const test = setup(); let finish!: (path: string) => void;
  jest.mocked(pickNameplate).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  let task!: Promise<void>;
  act(() => { task = test.result.current.capture('library'); });
  await act(async () => { await test.result.current.cancel(); });
  await act(async () => { await test.result.current.capture('camera'); });
  await act(async () => { finish('/late.jpg'); await task; });
  expect(test.result.current.state).toEqual({ phase: 'capturing', source: 'camera' });
  expect(test.extractFromImage).not.toHaveBeenCalled();
});
