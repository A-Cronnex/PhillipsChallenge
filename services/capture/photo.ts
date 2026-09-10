import * as ImagePicker from 'expo-image-picker';
import { PermissionsAndroid, Platform } from 'react-native';
import { retainArtifact } from './artifacts';

function withDeadline<T>(task: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('La cámara o el selector no respondió. Puedes elegir otra foto o continuar por voz.')), milliseconds);
    task.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export async function pickNameplate(source: 'camera' | 'library'): Promise<string | null> {
  if (source === 'camera') {
    // The current Pixel build hangs in Expo's permission promise (Android guide).
    const granted = Platform.OS === 'android'
      ? await withDeadline(PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA), 20000) === PermissionsAndroid.RESULTS.GRANTED
      : (await withDeadline(ImagePicker.requestCameraPermissionsAsync(), 20000)).granted;
    if (!granted) throw new Error('Permite el acceso a la cámara en los ajustes o elige una foto existente.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9, allowsEditing: false };
  const result = await withDeadline(source === 'camera' ? ImagePicker.launchCameraAsync(options) : ImagePicker.launchImageLibraryAsync(options), 120000);
  if (result.canceled) return null;
  const photo = result.assets[0];
  if (!photo?.uri || photo.width <= 0 || photo.height <= 0 || (photo.mimeType && !photo.mimeType.startsWith('image/'))) {
    throw new Error('El archivo seleccionado no es una imagen válida.');
  }
  return retainArtifact(photo.uri, 'image');
}
