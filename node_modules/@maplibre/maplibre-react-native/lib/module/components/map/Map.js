"use strict";

import { memo, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import AndroidTextureMapViewNativeComponent from "./AndroidTextureMapViewNativeComponent";
import MapViewNativeComponent from "./MapViewNativeComponent";
import NativeMapViewModule from "./NativeMapViewModule.js";
import { LogManager } from "../../modules/log/LogManager.js";
import { transformStyle } from "../../utils/StyleValue.js";
import { convertToInternalStyle } from "../../utils/convertStyleSpec.js";
import { findNodeHandle } from "../../utils/findNodeHandle.js";
import { getNativeFilter } from "../../utils/getNativeFilter.js";
import { jsx as _jsx } from "react/jsx-runtime";
const styles = StyleSheet.create({
  flex1: {
    flex: 1
  }
});

/**
 * Screen position for map ornaments (logo, compass, scale bar). Exactly one of
 * `top` / `bottom` and one of `left` / `right` must be provided.
 */

/**
 * Current viewport state of the map.
 */

/**
 * Event emitted when the map viewport changes (pan, zoom, rotate, pitch).
 */

/**
 * Options for querying rendered features at a screen point or within a bounding
 * box.
 */

/**
 * A view of a MapLibre Native Map.
 *
 * @example Rendering a basic Map
 * ```tsx
 * <Map mapStyle="https://demotiles.maplibre.org/style.json" />;
 * ```
 */
export const Map = /*#__PURE__*/memo(({
  androidView = "surface",
  style,
  ref,
  ...props
}) => {
  const [isReady, setIsReady] = useState(false);
  const nativeRef = useRef(null);
  useImperativeHandle(ref, () => ({
    getCenter: () => NativeMapViewModule.getCenter(findNodeHandle(nativeRef.current)),
    getZoom: () => NativeMapViewModule.getZoom(findNodeHandle(nativeRef.current)),
    getBearing: () => NativeMapViewModule.getBearing(findNodeHandle(nativeRef.current)),
    getPitch: () => NativeMapViewModule.getPitch(findNodeHandle(nativeRef.current)),
    getBounds: () => NativeMapViewModule.getBounds(findNodeHandle(nativeRef.current)),
    getViewState: () => NativeMapViewModule.getViewState(findNodeHandle(nativeRef.current)),
    project: lngLat => NativeMapViewModule.project(findNodeHandle(nativeRef.current), lngLat),
    unproject: point => NativeMapViewModule.unproject(findNodeHandle(nativeRef.current), point),
    queryRenderedFeatures: async (pixelPointOrPixelPointBoundsOrOptions, options) => {
      if (pixelPointOrPixelPointBoundsOrOptions && Array.isArray(pixelPointOrPixelPointBoundsOrOptions) && (value => typeof value[0] === "number" && typeof value[1] === "number")(pixelPointOrPixelPointBoundsOrOptions)) {
        return await NativeMapViewModule.queryRenderedFeaturesWithPoint(findNodeHandle(nativeRef.current), pixelPointOrPixelPointBoundsOrOptions, options?.layers ?? [], getNativeFilter(options?.filter));
      } else if (pixelPointOrPixelPointBoundsOrOptions && Array.isArray(pixelPointOrPixelPointBoundsOrOptions) && (value => Array.isArray(value[0]) && Array.isArray(value[1]))(pixelPointOrPixelPointBoundsOrOptions)) {
        return await NativeMapViewModule.queryRenderedFeaturesWithBounds(findNodeHandle(nativeRef.current), pixelPointOrPixelPointBoundsOrOptions, options?.layers ?? [], getNativeFilter(options?.filter));
      } else {
        return await NativeMapViewModule.queryRenderedFeaturesWithBounds(findNodeHandle(nativeRef.current), null, pixelPointOrPixelPointBoundsOrOptions?.layers ?? [], getNativeFilter(pixelPointOrPixelPointBoundsOrOptions?.filter));
      }
    },
    createStaticMapImage: options => NativeMapViewModule.createStaticMapImage(findNodeHandle(nativeRef.current), options.output),
    setSourceVisibility: (visible, source, sourceLayer) => NativeMapViewModule.setSourceVisibility(findNodeHandle(nativeRef.current), visible, source, sourceLayer ?? null),
    showAttribution: () => NativeMapViewModule.showAttribution(findNodeHandle(nativeRef.current))
  }));

  // Start before rendering
  useLayoutEffect(() => {
    LogManager.start();
    return () => {
      LogManager.stop();
    };
  }, []);
  const nativeProps = useMemo(() => {
    const {
      mapStyle,
      light,
      ...otherProps
    } = props;
    return {
      ...otherProps,
      ref: nativeRef,
      style: styles.flex1,
      mapStyle: typeof mapStyle === "object" ? JSON.stringify(mapStyle) : mapStyle,
      light: props.light ? transformStyle(convertToInternalStyle(props.light)) : undefined
    };
  }, [props]);
  let map = null;
  if (isReady) {
    const NativeMapView = Platform.OS === "android" && androidView === "texture" ? AndroidTextureMapViewNativeComponent : MapViewNativeComponent;
    map = /*#__PURE__*/_jsx(NativeMapView, {
      ...nativeProps
    });
  }
  return /*#__PURE__*/_jsx(View, {
    onLayout: () => setIsReady(true),
    style: style ?? styles.flex1,
    testID: nativeProps.testID ? `${nativeProps.testID}-view` : undefined,
    children: map
  });
});
//# sourceMappingURL=Map.js.map