"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.UserLocationPuckHeading = void 0;
var _react = require("react");
var _Layer = require("../layer/Layer.js");
var _jsxRuntime = require("react/jsx-runtime");
const SYMBOL_LAYER_LAYOUT = {
  "icon-image": "mlrn-user-location-puck-heading",
  "icon-allow-overlap": true,
  "icon-pitch-alignment": "map",
  "icon-rotation-alignment": "map"
};
const UserLocationPuckHeading = exports.UserLocationPuckHeading = /*#__PURE__*/(0, _react.memo)(({
  source,
  beforeId,
  heading
}) => /*#__PURE__*/(0, _jsxRuntime.jsx)(_Layer.Layer, {
  type: "symbol",
  id: "mlrn-user-location-puck-heading",
  testID: "mlrn-user-location-puck-heading",
  source: source,
  beforeId: beforeId,
  layout: {
    ...SYMBOL_LAYER_LAYOUT,
    "icon-rotate": heading
  }
}));
//# sourceMappingURL=UserLocationPuckHeading.js.map