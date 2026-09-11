import { PermissionsAndroid, Platform } from 'react-native';
import { requestCameraAccess, retainPhoto, pickNameplate } from '../../services/capture/photo';
import { retainArtifact } from '../../services/capture/artifacts';
import * as ImagePicker from 'expo-image-picker';

jest.mock('../../services/capture/artifacts', () => ({ retainArtifact: jest.fn(() => '/private/plate.jpg') }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => jest.restoreAllMocks());
test('an already granted Android camera permission does not request it again', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  const request = jest.spyOn(PermissionsAndroid, 'request');
  await expect(requestCameraAccess()).resolves.toBe(true);
  expect(request).not.toHaveBeenCalled();
});
test('denied Android permission is returned to the camera UI', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
  await expect(requestCameraAccess()).resolves.toBe(false);
});
test('invalid native photo is not copied and a valid capture is retained privately', () => {
  expect(() => retainPhoto({ uri: '/invalid.jpg', width: 0, height: 20 })).toThrow('imagen válida');
  expect(retainArtifact).not.toHaveBeenCalled();
  expect(retainPhoto({ uri: '/camera.jpg', width: 800, height: 600 })).toBe('/private/plate.jpg');
  expect(retainArtifact).toHaveBeenCalledWith('/camera.jpg', 'image');
});
test('gallery cancellation produces no artifact', async () => {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null });
  await expect(pickNameplate()).resolves.toBeNull();
  expect(retainArtifact).not.toHaveBeenCalled();
});
