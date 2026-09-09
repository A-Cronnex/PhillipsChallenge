"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.findNodeHandle = void 0;
var _reactNative = require("react-native");
const findNodeHandle = ref => {
  const nodeHandle = (0, _reactNative.findNodeHandle)(ref);
  if (nodeHandle === null) {
    throw new Error("NativeComponent ref is null, wait for the map being initialized");
  }
  return nodeHandle;
};
exports.findNodeHandle = findNodeHandle;
//# sourceMappingURL=findNodeHandle.js.map