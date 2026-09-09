"use strict";

import { memo, useImperativeHandle, useRef } from "react";
import GeoJSONSourceNativeComponent from "./GeoJSONSourceNativeComponent";
import NativeGeoJSONSourceModule from "./NativeGeoJSONSourceModule.js";
import { useFrozenId } from "../../../hooks/useFrozenId.js";
import { cloneReactChildrenWithProps } from "../../../utils/index.js";
import { findNodeHandle } from "../../../utils/findNodeHandle.js";
import { getNativeFilter } from "../../../utils/getNativeFilter.js";
import { jsx as _jsx } from "react/jsx-runtime";
/**
 * GeoJSONSource is a map content source that supplies GeoJSON to be shown on
 * the map. The data may be provided as an url or a GeoJSON object.
 */
export const GeoJSONSource = /*#__PURE__*/memo(({
  id,
  data,
  ref,
  ...props
}) => {
  const nativeRef = useRef(null);
  const frozenId = useFrozenId(id);
  useImperativeHandle(ref, () => ({
    getData: async filter => {
      return NativeGeoJSONSourceModule.getData(findNodeHandle(nativeRef.current), getNativeFilter(filter));
    },
    getClusterExpansionZoom: async clusterId => {
      return NativeGeoJSONSourceModule.getClusterExpansionZoom(findNodeHandle(nativeRef.current), clusterId);
    },
    getClusterLeaves: async (clusterId, limit, offset) => {
      return NativeGeoJSONSourceModule.getClusterLeaves(findNodeHandle(nativeRef.current), clusterId, limit, offset);
    },
    getClusterChildren: async clusterId => {
      return NativeGeoJSONSourceModule.getClusterChildren(findNodeHandle(nativeRef.current), clusterId);
    },
    getAnimatableRef: () => nativeRef.current ? new Proxy(nativeRef.current, {
      get: (target, prop) => prop === "_viewConfig" ? target.__viewConfig : target[prop]
    }) : null
  }));
  return /*#__PURE__*/_jsx(GeoJSONSourceNativeComponent, {
    ref: nativeRef,
    id: frozenId,
    data: typeof data === "string" ? data : JSON.stringify(data),
    hasOnPress: !!props.onPress,
    ...props,
    children: cloneReactChildrenWithProps(props.children, {
      source: frozenId
    })
  });
});
//# sourceMappingURL=GeoJSONSource.js.map