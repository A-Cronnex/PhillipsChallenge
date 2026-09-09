"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Images = void 0;
var _react = require("react");
var _reactNative = require("react-native");
var _ImagesNativeComponent = _interopRequireDefault(require("./ImagesNativeComponent"));
require("./NativeImagesModule.js");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * An image source with optional SDF (Signed Distance Field) rendering mode.
 */

/**
 * A map image entry: a URL string, a native asset require, or an
 * {@link ImageSourceWithSdf} object.
 */

/**
 * Images defines the images used in Symbol layers.
 *
 * Use this component to add images to the map style that can be referenced by
 * symbol layers using the `iconImage` property.
 */
const Images = ({
  testID,
  images,
  onImageMissing
}) => {
  const nativeImages = (0, _react.useMemo)(() => {
    const result = {};
    Object.entries(images).forEach(([imageName, value]) => {
      if (typeof value === "string") {
        result[imageName] = {
          uri: value
        };
      } else {
        const resolved = _reactNative.Image.resolveAssetSource(typeof value === "number" ? value : value.source);
        result[imageName] = {
          uri: resolved.uri,
          scale: resolved.scale,
          sdf: typeof value === "object" ? value.sdf : false
        };
      }
    });
    return result;
  }, [images]);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_ImagesNativeComponent.default, {
    testID: testID,
    images: nativeImages,
    onImageMissing: onImageMissing
  });
};
exports.Images = Images;
//# sourceMappingURL=Images.js.map