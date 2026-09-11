import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NameplateCamera } from '../../../features/conversations/ui/NameplateCamera';
import { requestCameraAccess } from '../../../services/capture/photo';
import { AppState } from 'react-native';

const mockTake = jest.fn();
jest.mock('@expo/vector-icons', () => ({ MaterialIcons: () => null }));
jest.mock('../../../services/capture/photo', () => ({ requestCameraAccess: jest.fn() }));
jest.mock('expo-camera', () => {
  const React = require('react'); const { View } = require('react-native');
  return { CameraView: React.forwardRef((props: unknown, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ takePictureAsync: mockTake }));
    return <View testID="native-camera" {...props as object} />;
  }) };
});
beforeEach(() => {
  jest.clearAllMocks();
  AppState.currentState = 'active';
  jest.mocked(requestCameraAccess).mockResolvedValue(true);
  mockTake.mockResolvedValue({ uri: '/camera.jpg', width: 1200, height: 1600 });
});
async function open(onCaptured = jest.fn(async () => {}), onCancel = jest.fn()) {
  render(<NameplateCamera onCaptured={onCaptured} onCancel={onCancel} onLibrary={jest.fn()} />);
  await waitFor(() => expect(screen.getByTestId('native-camera')).toBeTruthy());
  expect(screen.getByLabelText('Tomar fotografía')).toBeDisabled();
  fireEvent(screen.getByTestId('native-camera'), 'cameraReady');
  return { onCaptured, onCancel };
}
test('waits for native readiness, previews and retakes without sending until confirmed', async () => {
  const { onCaptured } = await open();
  fireEvent.press(screen.getByLabelText('Tomar fotografía'));
  await waitFor(() => expect(screen.getByLabelText('Vista previa de la fotografía')).toBeTruthy());
  expect(screen.queryByTestId('native-camera')).toBeNull();
  expect(onCaptured).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Repetir fotografía'));
  fireEvent(screen.getByTestId('native-camera'), 'cameraReady');
  fireEvent.press(screen.getByLabelText('Tomar fotografía'));
  await waitFor(() => expect(screen.getByText('Usar fotografía')).toBeTruthy());
  fireEvent.press(screen.getByText('Usar fotografía'));
  await waitFor(() => expect(onCaptured).toHaveBeenCalledTimes(1));
  expect(onCaptured).toHaveBeenCalledWith({ uri: '/camera.jpg', width: 1200, height: 1600 });
});
test('denied permission offers settings, retry and gallery without mounting the camera', async () => {
  jest.mocked(requestCameraAccess).mockResolvedValue(false);
  render(<NameplateCamera onCaptured={jest.fn()} onCancel={jest.fn()} onLibrary={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('Abrir ajustes')).toBeTruthy());
  expect(screen.queryByTestId('native-camera')).toBeNull();
  expect(screen.getByLabelText('Elegir de mis fotos')).toBeTruthy();
});
test('a failed native capture permits another attempt and never submits a photo', async () => {
  const { onCaptured } = await open(); mockTake.mockRejectedValueOnce(new Error('camera busy'));
  fireEvent.press(screen.getByLabelText('Tomar fotografía'));
  await waitFor(() => expect(screen.getByText('Reintentar cámara')).toBeTruthy());
  expect(onCaptured).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Reintentar cámara'));
  await waitFor(() => expect(screen.getByTestId('native-camera')).toBeTruthy());
});
test('closing during a capture ignores its late result', async () => {
  const { onCaptured, onCancel } = await open();
  let finish!: (photo: unknown) => void;
  mockTake.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  fireEvent.press(screen.getByLabelText('Tomar fotografía'));
  fireEvent.press(screen.getByLabelText('Cerrar cámara'));
  await act(async () => finish({ uri: '/late.jpg', width: 100, height: 100 }));
  expect(onCancel).toHaveBeenCalled();
  expect(onCaptured).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Vista previa de la fotografía')).toBeNull();
});
