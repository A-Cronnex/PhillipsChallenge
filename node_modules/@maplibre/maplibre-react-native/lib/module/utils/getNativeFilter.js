"use strict";

export function getNativeFilter(filter) {
  if (Array.isArray(filter)) {
    return filter;
  }
  if (typeof filter === "boolean") {
    return ["literal", filter];
  }
  return [];
}
//# sourceMappingURL=getNativeFilter.js.map