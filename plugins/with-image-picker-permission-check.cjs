const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

const marker = '// HEI: do not request an already granted camera permission.';
const anchor = `    val permissions = appContext.permissions ?: throw ModuleNotFoundException("Permissions")

    permissions.askForPermissions(`;

/** Expo 17's internal second request can strand the camera coroutine on Pixel.
 * Keep the normal permission flow for ungranted permissions and pre-Q devices.
 * This is applied to the pinned source during prebuild, not a hand-edited APK.
 */
function patchImagePicker(source) {
  if (source.includes(marker)) return source;
  if (!source.includes(anchor)) throw new Error('ImagePicker permission workaround: upstream source changed; review this patch before rebuilding.');
  return source.replace(anchor, `    val permissions = appContext.permissions ?: throw ModuleNotFoundException("Permissions")

    ${marker}
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && permissions.hasGrantedPermissions(Manifest.permission.CAMERA)) {
      continuation.resume(Unit)
      return@suspendCancellableCoroutine
    }

    permissions.askForPermissions(`);
}

module.exports = config => withDangerousMod(config, ['android', async config => {
  const root = path.dirname(require.resolve('expo-image-picker/package.json', { paths: [config.modRequest.projectRoot] }));
  const sourcePath = path.join(root, 'android/src/main/java/expo/modules/imagepicker/ImagePickerModule.kt');
  const original = fs.readFileSync(sourcePath, 'utf8');
  const patched = patchImagePicker(original);
  if (original !== patched) fs.writeFileSync(sourcePath, patched);
  return config;
}]);
module.exports.patchImagePicker = patchImagePicker;
