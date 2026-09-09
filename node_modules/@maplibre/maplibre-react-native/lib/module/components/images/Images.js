"use strict";

import { useMemo } from "react";
import { Image } from "react-native";
import ImagesNativeComponent from "./ImagesNativeComponent";
import "./NativeImagesModule.js";

/**
 * An image source with optional SDF (Signed Distance Field) rendering mode.
 */

/**
 * A map image entry: a URL string, a native asset require, or an
 * {@link ImageSourceWithSdf} object.
 */
import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Images defines the images used in Symbol layers.
 *
 * Use this component to add images to the map style that can be referenced by
 * symbol layers using the `iconImage` property.
 */
export const Images = ({
  testID,
  images,
  onImageMissing
}) => {
  const nativeImages = useMemo(() => {
    const result = {};
    Object.entries(images).forEach(([imageName, value]) => {
      if (typeof value === "string") {
        result[imageName] = {
          uri: value
        };
      } else {
        const resolved = Image.resolveAssetSource(typeof value === "number" ? value : value.source);
        result[imageName] = {
          uri: resolved.uri,
          scale: resolved.scale,
          sdf: typeof value === "object" ? value.sdf : false
        };
      }
    });
    return result;
  }, [images]);
  return /*#__PURE__*/_jsx(ImagesNativeComponent, {
    testID: testID,
    images: nativeImages,
    onImageMissing: onImageMissing
  });
};
//# sourceMappingURL=Images.js.map