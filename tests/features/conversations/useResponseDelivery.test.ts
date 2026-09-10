import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { useResponseDelivery } from '../../../features/conversations/ui/useResponseDelivery';

let frames: FrameRequestCallback[];
beforeEach(() => {
  frames = [];
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => { frames.push(callback); return frames.length; });
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => { frames = []; });
});
afterEach(() => jest.restoreAllMocks());
function tick(time: number) { const callback = frames.shift(); act(() => callback?.(time)); }
test('persists full text first, then reveals one Unicode character per step', async () => {
  const { result } = renderHook(() => useResponseDelivery());
  await act(async () => {});
  const persist = jest.fn(async () => {});
  let done: Promise<void>;
  await act(async () => { done = result.current.reveal(3, 'Sí🙂', persist); });
  expect(persist).toHaveBeenCalledTimes(1);
  expect(result.current.delivery).toEqual({ turnIndex: 3, text: '' });
  tick(0); expect(result.current.delivery?.text).toBe('S');
  tick(24); expect(result.current.delivery?.text).toBe('Sí');
  tick(48);
  await act(async () => { await done!; });
  expect(result.current.delivery).toBeNull();
});
test('reduced motion immediately displays the complete saved response', async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
  const { result } = renderHook(() => useResponseDelivery());
  await act(async () => {});
  await act(async () => { await result.current.reveal(0, 'Respuesta', async () => {}); });
  expect(result.current.delivery).toBeNull();
  expect(frames).toHaveLength(0);
});
test('leaving the screen releases delivery without leaving the conversation busy', async () => {
  const { result, unmount } = renderHook(() => useResponseDelivery());
  await act(async () => {});
  let done: Promise<void>;
  await act(async () => { done = result.current.reveal(0, 'Respuesta', async () => {}); });
  unmount();
  await done!;
  expect(frames).toHaveLength(0);
});
