import { pcm16 } from '../../services/capture/microphone';
jest.mock('../../services/capture/artifacts', () => ({ retainArtifact: jest.fn() }));
test('converts and clips microphone float samples to signed little-endian PCM without changing duration', () => {
  const bytes = pcm16(new Float32Array([-2, -1, 0, 0.5, 1, 2]));
  expect(bytes.length).toBe(12);
  const view = new DataView(bytes.buffer);
  expect(Array.from({ length: 6 }, (_, i) => view.getInt16(i * 2, true))).toEqual([-32768, -32768, 0, 16384, 32767, 32767]);
  expect([...bytes.slice(6, 8)]).toEqual([0, 64]);
});
