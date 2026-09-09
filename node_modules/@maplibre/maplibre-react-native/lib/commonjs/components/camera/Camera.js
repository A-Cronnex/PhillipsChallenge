"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Camera = void 0;
var _react = require("react");
var _reactNative = require("react-native");
var _CameraNativeComponent = _interopRequireDefault(require("./CameraNativeComponent"));
var _NativeCameraModule = _interopRequireDefault(require("./NativeCameraModule.js"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
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

/**
 * Controls the viewport of the Map.
 */
const Camera = exports.Camera = /*#__PURE__*/(0, _react.memo)(({
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
  const nativeRef = (0, _react.useRef)(null);
  const setStop = stop => {
    const nodeHandle = (0, _reactNative.findNodeHandle)(nativeRef.current);
    if (!nodeHandle) {
      throw new Error("NativeCameraComponent ref is null, wait for the map being initialized");
    }
    return _NativeCameraModule.default.setStop(nodeHandle, stop);
  };
  (0, _react.useImperativeHandle)(ref, () => ({
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
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_CameraNativeComponent.default, {
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