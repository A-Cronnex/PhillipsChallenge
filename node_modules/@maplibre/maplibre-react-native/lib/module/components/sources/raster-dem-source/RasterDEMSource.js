"use strict";

import { memo } from "react";
import RasterDEMSourceNativeComponent from "./RasterDEMSourceNativeComponent";
import { useFrozenId } from "../../../hooks/useFrozenId.js";
import { cloneReactChildrenWithProps } from "../../../utils/index.js";
import { jsx as _jsx } from "react/jsx-runtime";
/**
 * RasterDEMSource is a map content source that supplies rasterized digital
 * elevation model (DEM) tiles to be shown on the map. Use it together with a
 * hillshade layer to visualize terrain.
 */
export const RasterDEMSource = /*#__PURE__*/memo(({
  id,
  ...props
}) => {
  const frozenId = useFrozenId(id);
  return /*#__PURE__*/_jsx(RasterDEMSourceNativeComponent, {
    id: frozenId,
    ...props,
    children: cloneReactChildrenWithProps(props.children, {
      source: frozenId
    })
  });
});
//# sourceMappingURL=RasterDEMSource.js.map