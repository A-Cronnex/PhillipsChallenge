"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.LayerAnnotation = void 0;
var _react = require("react");
var _reactNative = require("react-native");
var _Animated = require("../../utils/animated/Animated.js");
var _AnimatedPoint = require("../../utils/animated/AnimatedPoint.js");
var _jsxRuntime = require("react/jsx-runtime");
const isAnimated = data => data instanceof _AnimatedPoint.AnimatedPoint;

/**
 * Convenience wrapper around a GeoJSONSource for a Point/LngLat, optionally
 * animated.
 */
const LayerAnnotation = ({
  lngLat,
  animated = false,
  animationDuration = 1000,
  animationEasingFunction = _reactNative.Easing.linear,
  ...props
}) => {
  const [data, setData] = (0, _react.useState)(() => {
    const point = {
      type: "Point",
      coordinates: lngLat
    };
    if (animated) {
      return new _AnimatedPoint.AnimatedPoint(point);
    }
    return point;
  });
  (0, _react.useEffect)(() => {
    if (isAnimated(data)) {
      data.stopAnimation();
      data.timing({
        toValue: {
          type: "Point",
          coordinates: lngLat
        },
        easing: animationEasingFunction,
        duration: animationDuration
      }).start();
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData({
        type: "Point",
        coordinates: lngLat
      });
    }
  }, [lngLat[0], lngLat[1]]);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_Animated.Animated.GeoJSONSource, {
    data: data,
    ...props
  });
};
exports.LayerAnnotation = LayerAnnotation;
//# sourceMappingURL=LayerAnnotation.js.map