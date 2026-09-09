"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _reactNative = require("react-native");
const imagesModule = _reactNative.Platform.OS === "ios" ? _reactNative.TurboModuleRegistry.getEnforcing("MLRNImagesModule") : null;
var _default = exports.default = imagesModule;
//# sourceMappingURL=NativeImagesModule.js.map