"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useFrozenId = useFrozenId;
var _react = require("react");
let generatedIdCounter = 0;
function useFrozenId(id) {
  const [frozenId] = (0, _react.useState)(id ? id : `mlrn-${generatedIdCounter++}`);
  if (id && id !== frozenId) {
    throw new Error("`id` cannot be changed");
  }
  return frozenId;
}
//# sourceMappingURL=useFrozenId.js.map