"use strict";

import { useImperativeHandle, useRef } from "react";
import { Platform, View } from "react-native";
import MarkerViewNativeComponent from "./MarkerViewNativeComponent";
import { useFrozenId } from "../../../hooks/useFrozenId.js";
import { anchorToNative } from "../../../types/Anchor.js";
import { ViewAnnotation } from "../view-annotation/ViewAnnotation.js";

/**
 * Event emitted by a Marker on press.
 */
import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Marker allows you to place an interactive React Native View on the map.
 *
 * If you have static view consider using ViewAnnotation or SymbolLayer for
 * better performance.
 *
 * Implemented through:
 * - Android: Native Views placed on the map projection
 * - iOS:
 *   [MLNPointAnnotation](https://maplibre.org/maplibre-native/ios/latest/documentation/maplibre/mlnpointannotation/)
 */
export const Marker = ({
  id,
  anchor = "center",
  offset,
  ref,
  ...props
}) => {
  const nativeRef = useRef(null);
  const viewAnnotationRef = useRef(null);
  const nativeAnchor = anchorToNative(anchor);
  const nativeOffset = offset ? {
    x: offset[0],
    y: offset[1]
  } : undefined;
  const frozenId = useFrozenId(id);
  useImperativeHandle(ref, () => ({
    // Reanimated v4 compatibility: createAnimatedComponent looks for _viewConfig but native has __viewConfig
    getAnimatableRef: () => {
      if (Platform.OS === "ios") {
        return viewAnnotationRef.current?.getAnimatableRef();
      }
      return nativeRef.current ? new Proxy(nativeRef.current, {
        get: (target, prop) => prop === "_viewConfig" ? target.__viewConfig : target[prop]
      }) : null;
    }
  }));
  if (Platform.OS === "ios") {
    return /*#__PURE__*/_jsx(ViewAnnotation, {
      ref: viewAnnotationRef,
      id: frozenId,
      anchor: anchor,
      offset: offset,
      ...props
    });
  }
  return /*#__PURE__*/_jsx(MarkerViewNativeComponent, {
    ref: nativeRef,
    id: frozenId,
    anchor: nativeAnchor,
    offset: nativeOffset,
    ...props,
    style: [{
      flex: 0,
      alignSelf: "flex-start",
      overflow: "visible"
    }, props.style],
    children: /*#__PURE__*/_jsx(View, {
      collapsable: false,
      style: {
        flex: 0,
        alignSelf: "flex-start",
        overflow: "visible"
      },
      children: props.children
    })
  });
};
//# sourceMappingURL=Marker.js.map