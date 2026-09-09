"use strict";

import { memo } from "react";
import { Layer } from "../layer/Layer.js";
import { jsx as _jsx } from "react/jsx-runtime";
const SYMBOL_LAYER_LAYOUT = {
  "icon-image": "mlrn-user-location-puck-heading",
  "icon-allow-overlap": true,
  "icon-pitch-alignment": "map",
  "icon-rotation-alignment": "map"
};
export const UserLocationPuckHeading = /*#__PURE__*/memo(({
  source,
  beforeId,
  heading
}) => /*#__PURE__*/_jsx(Layer, {
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