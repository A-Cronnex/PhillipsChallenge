import * as ImagePicker from 'expo-image-picker';
import { PermissionsAndroid, Platform } from 'react-native';
import { retainArtifact } from './artifacts';

function withDeadline<T>(task: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), milliseconds);
    task.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

const SELECTOR_STALLED = 'La cámara o el selector no respondió. Puedes elegir una foto de tu galería o continuar por voz.';

export async function requestCameraAccess(): Promise<boolean> {
  if (Platform.OS === 'android') {
    if (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA)) return true;
    return await withDeadline(PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA), 20000, SELECTOR_STALLED) === PermissionsAndroid.RESULTS.GRANTED;
  }
  const camera = require('expo-camera') as typeof import('expo-camera');
  if ((await camera.Camera.getCameraPermissionsAsync()).granted) return true;
  return (await withDeadline(camera.Camera.requestCameraPermissionsAsync(), 20000, SELECTOR_STALLED)).granted;
}

export interface CapturedPhoto { uri: string; width: number; height: number; mimeType?: string }

export function retainPhoto(photo: CapturedPhoto): string {
  if (!photo?.uri || !Number.isFinite(photo.width) || !Number.isFinite(photo.height) || photo.width <= 0 || photo.height <= 0 || (photo.mimeType && !photo.mimeType.startsWith('image/'))) {
    throw new Error('El archivo seleccionado no es una imagen válida.');
  }
  return retainArtifact(photo.uri, 'image');
}

/** Camera capture is embedded; ImagePicker is only used for the system gallery. */
export async function pickNameplate(_source: 'library' = 'library'): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9, allowsEditing: false };
  const result = await withDeadline(ImagePicker.launchImageLibraryAsync(options), 120000, SELECTOR_STALLED);
  if (result.canceled) return null;
  return retainPhoto(result.assets[0]);
}
