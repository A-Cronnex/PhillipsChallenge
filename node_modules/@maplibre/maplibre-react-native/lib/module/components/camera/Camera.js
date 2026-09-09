"use strict";

import { memo, useImperativeHandle, useRef } from "react";
import { findNodeHandle } from "react-native";
import NativeCameraComponent from "./CameraNativeComponent";
import NativeCameraModule from "./NativeCameraModule.js";

/**
 * Camera viewport configuration: zoom, bearing, pitch, and padding.
 */

/**
 * Easing function used for camera animations.
 */

/**
 * Animation timing options for camera transitions.
 */

/**
 * Camera center coordinate options.
 */

/**
 * Camera bounds options.
 */

/**
 * Camera animation stop positioned by a center coordinate.
 */

/**
 * Camera animation stop positioned by geographic bounds.
 */

/**
 * A single camera animation stop — optionally positioned by center, bounds, or
 * neither.
 */

/**
 * Initial camera state when the map first loads.
 */

/**
 * User location tracking mode.
 */

/**
 * Event emitted when the user location tracking mode changes.
 */
import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Controls the viewport of the Map.
 */
export const Camera = /*#__PURE__*/memo(({
  testID,
  initialViewState,
  minZoom,
  maxZoom,
  maxBounds,
  trackUserLocation,
  onTrackUserLocationChange,
  ref,
  ...stop
}) => {
  const nativeRef = useRef(null);
  const setStop = stop => {
    const nodeHandle = findNodeHandle(nativeRef.current);
    if (!nodeHandle) {
      throw new Error("NativeCameraComponent ref is null, wait for the map being initialized");
    }
    return NativeCameraModule.setStop(nodeHandle, stop);
  };
  useImperativeHandle(ref, () => ({
    setStop,
    jumpTo: ({
      center,
      ...options
    }) => setStop({
      ...options,
      center,
      duration: 0,
      easing: undefined
    }),
    easeTo: ({
      center,
      duration = 500,
      easing = "ease",
      ...options
    }) => setStop({
      ...options,
      center,
      duration,
      easing
    }),
    flyTo: ({
      center,
      duration = 2000,
      easing = "fly",
      ...options
    }) => setStop({
      ...options,
      center,
      duration,
      easing
    }),
    fitBounds: (bounds, {
      duration = 2000,
      easing = "fly",
      ...options
    } = {}) => setStop({
      ...options,
      bounds,
      duration,
      easing
    }),
    zoomTo: (zoom, {
      duration = 500,
      easing = "ease",
      ...options
    } = {}) => setStop({
      ...options,
      zoom,
      duration,
      easing
    })
  }));
  return /*#__PURE__*/_jsx(NativeCameraComponent, {
    ref: nativeRef,
    testID: testID,
    stop: stop,
    initialViewState: initialViewState,
    minZoom: minZoom,
    maxZoom: maxZoom,
    maxBounds: maxBounds,
    trackUserLocation: trackUserLocation,
    onTrackUserLocationChange: onTrackUserLocationChange
  });
});
//# sourceMappingURL=Camera.js.map