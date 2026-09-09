"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getNativeFilter = getNativeFilter;
function getNativeFilter(filter) {
  if (Array.isArray(filter)) {
    return filter;
  }
  if (typeof filter === "boolean") {
    return ["literal", filter];
  }
  return [];
}
//# sourceMappingURL=getNativeFilter.js.map