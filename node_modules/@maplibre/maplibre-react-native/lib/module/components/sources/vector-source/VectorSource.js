"use strict";

import { memo, useImperativeHandle, useRef } from "react";
import NativeVectorSourceModule from "./NativeVectorSourceModule.js";
import VectorSourceNativeComponent from "./VectorSourceNativeComponent";
import { useFrozenId } from "../../../hooks/useFrozenId.js";
import { cloneReactChildrenWithProps } from "../../../utils/index.js";
import { findNodeHandle } from "../../../utils/findNodeHandle.js";
import { getNativeFilter } from "../../../utils/getNativeFilter.js";
import { jsx as _jsx } from "react/jsx-runtime";
/**
 * VectorSource is a map content source that supplies tiled vector data in
 * Mapbox Vector Tile format to be shown on the map. The location of and
 * metadata about the tiles are defined either by an option dictionary or by an
 * external file that conforms to the TileJSON specification.
 */
export const VectorSource = /*#__PURE__*/memo(({
  id,
  ref,
  ...props
}) => {
  const nativeRef = useRef(null);
  const frozenId = useFrozenId(id);
  useImperativeHandle(ref, () => ({
    querySourceFeatures: async ({
      sourceLayer,
      filter
    }) => {
      return NativeVectorSourceModule.querySourceFeatures(findNodeHandle(nativeRef.current), sourceLayer, getNativeFilter(filter));
    }
  }));
  return /*#__PURE__*/_jsx(VectorSourceNativeComponent, {
    ref: nativeRef,
    id: frozenId,
    hasOnPress: !!props.onPress,
    ...props,
    children: cloneReactChildrenWithProps(props.children, {
      source: frozenId
    })
  });
});
//# sourceMappingURL=VectorSource.js.map