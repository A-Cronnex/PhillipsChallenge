"use strict";

import { memo, useMemo } from "react";
import { UserLocationPuck } from "./UserLocationPuck.js";
import headingIcon from "../../assets/heading.png";
import { useCurrentPosition } from "../../hooks/useCurrentPosition.js";
import { LayerAnnotation } from "../annotations/LayerAnnotation.js";
import { Images } from "../images/Images.js";
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
export const UserLocation = /*#__PURE__*/memo(({
  animated = true,
  accuracy = false,
  heading = false,
  minDisplacement,
  children,
  onPress
}) => {
  const currentPosition = useCurrentPosition({
    minDisplacement
  });
  const lngLat = useMemo(() => {
    return currentPosition?.coords ? [currentPosition.coords.longitude, currentPosition.coords.latitude] : undefined;
  }, [currentPosition?.coords]);
  if (!lngLat || !currentPosition) {
    return null;
  }
  return /*#__PURE__*/_jsxs(_Fragment, {
    children: [heading && /*#__PURE__*/_jsx(Images, {
      images: {
        "mlrn-user-location-puck-heading": headingIcon
      }
    }), /*#__PURE__*/_jsx(LayerAnnotation, {
      animated: animated,
      id: "mlrn-user-location",
      testID: "mlrn-user-location",
      onPress: onPress,
      lngLat: lngLat,
      children: children || /*#__PURE__*/_jsx(UserLocationPuck, {
        testID: "mlrn-user-location-puck",
        source: "mlrn-user-location",
        accuracy: accuracy ? currentPosition.coords.accuracy : undefined,
        heading: heading ? currentPosition.coords.heading ?? undefined : undefined
      })
    })]
  });
});
//# sourceMappingURL=UserLocation.js.map