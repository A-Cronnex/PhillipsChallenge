"use strict";

import { memo } from "react";
import ImageSourceNativeComponent from "./ImageSourceNativeComponent";
import { useFrozenId } from "../../../hooks/useFrozenId.js";
import { cloneReactChildrenWithProps, isNumber, resolveImagePath } from "../../../utils/index.js";
import { jsx as _jsx } from "react/jsx-runtime";
/**
 * ImageSource is a content source that is used for a georeferenced raster image
 * to be shown on the map. The georeferenced image scales and rotates as the
 * user zooms and rotates the map
 */
export const ImageSource = /*#__PURE__*/memo(({
  id,
  url,
  ...props
}) => {
  const frozenId = useFrozenId(id);
  return /*#__PURE__*/_jsx(ImageSourceNativeComponent, {
    id: frozenId,
    url: isNumber(url) ? resolveImagePath(url) : url,
    coordinates: props.coordinates,
    children: cloneReactChildrenWithProps(props.children, {
      source: frozenId
    })
  });
});
//# sourceMappingURL=ImageSource.js.map