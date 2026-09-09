"use strict";

import { memo } from "react";
import RasterSourceNativeComponent from "./RasterSourceNativeComponent";
import { useFrozenId } from "../../../hooks/useFrozenId.js";
import { cloneReactChildrenWithProps } from "../../../utils/index.js";
import { jsx as _jsx } from "react/jsx-runtime";
/**
 * RasterSource is a map content source that supplies raster image tiles to be
 * shown on the map. The location of and metadata about the tiles are defined
 * either by an option dictionary or by an external file that conforms to the
 * TileJSON specification.
 */
export const RasterSource = /*#__PURE__*/memo(({
  id,
  ...props
}) => {
  const frozenId = useFrozenId(id);
  return /*#__PURE__*/_jsx(RasterSourceNativeComponent, {
    id: frozenId,
    ...props,
    children: cloneReactChildrenWithProps(props.children, {
      source: frozenId
    })
  });
});
//# sourceMappingURL=RasterSource.js.map