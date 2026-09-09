"use strict";

import { memo } from "react";
import { UserLocationPuckHeading } from "./UserLocationPuckHeading.js";
import { Layer } from "../layer/Layer.js";
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
const blue = "#33B5E5";
const CIRCLE_LAYERS_PAINT = {
  accuracy: {
    "circle-color": blue,
    "circle-opacity": 0.2,
    "circle-pitch-alignment": "map",
    "circle-radius-transition": {
      duration: 300,
      delay: 0
    }
  },
  white: {
    "circle-radius": 9,
    "circle-color": "#fff",
    "circle-pitch-alignment": "map"
  },
  blue: {
    "circle-radius": 6,
    "circle-color": blue,
    "circle-pitch-alignment": "map"
  }
};
export const UserLocationPuck = /*#__PURE__*/memo(({
  source,
  accuracy,
  heading
}) => {
  return /*#__PURE__*/_jsxs(_Fragment, {
    children: [typeof accuracy === "number" && /*#__PURE__*/_jsx(Layer, {
      type: "circle",
      id: "mlrn-user-location-puck-accuracy",
      testID: "mlrn-user-location-puck-accuracy",
      source: source,
      paint: {
        ...CIRCLE_LAYERS_PAINT.accuracy,
        "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 0, CIRCLE_LAYERS_PAINT.white["circle-radius"], 22, CIRCLE_LAYERS_PAINT.white["circle-radius"] + accuracy * 100]
      }
    }), /*#__PURE__*/_jsx(Layer, {
      type: "circle",
      id: "mlrn-user-location-puck-white",
      testID: "mlrn-user-location-puck-white",
      source: source,
      paint: CIRCLE_LAYERS_PAINT.white
    }), /*#__PURE__*/_jsx(Layer, {
      type: "circle",
      id: "mlrn-user-location-puck-blue",
      testID: "mlrn-user-location-puck-blue",
      source: source,
      paint: CIRCLE_LAYERS_PAINT.blue
    }), typeof heading === "number" && /*#__PURE__*/_jsx(UserLocationPuckHeading, {
      source: source,
      beforeId: "mlrn-user-location-puck-white",
      heading: heading
    })]
  });
});
//# sourceMappingURL=UserLocationPuck.js.map