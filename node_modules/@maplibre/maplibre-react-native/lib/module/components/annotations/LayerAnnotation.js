"use strict";

import { useEffect, useState } from "react";
import { Easing } from "react-native";
import { Animated } from "../../utils/animated/Animated.js";
import { AnimatedPoint } from "../../utils/animated/AnimatedPoint.js";
import { jsx as _jsx } from "react/jsx-runtime";
const isAnimated = data => data instanceof AnimatedPoint;

/**
 * Convenience wrapper around a GeoJSONSource for a Point/LngLat, optionally
 * animated.
 */
export const LayerAnnotation = ({
  lngLat,
  animated = false,
  animationDuration = 1000,
  animationEasingFunction = Easing.linear,
  ...props
}) => {
  const [data, setData] = useState(() => {
    const point = {
      type: "Point",
      coordinates: lngLat
    };
    if (animated) {
      return new AnimatedPoint(point);
    }
    return point;
  });
  useEffect(() => {
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
  return /*#__PURE__*/_jsx(Animated.GeoJSONSource, {
    data: data,
    ...props
  });
};
//# sourceMappingURL=LayerAnnotation.js.map