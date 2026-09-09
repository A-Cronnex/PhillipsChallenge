"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _configPlugins = require("expo/config-plugins");
var _android = require("./android.js");
var _ios = require("./ios.js");
let pkg = {
  name: "@maplibre/maplibre-react-native"
};
try {
  pkg = require("@maplibre/maplibre-react-native/package.json");
} catch {
  // empty catch block
}
const withMapLibre = (config, props) => {
  // Android
  config = _android.android.withGradleProperties(config, props);

  // iOS
  config = _ios.ios.withDwarfDsym(config);
  config = _ios.ios.withPodfileGlobalVariables(config, props);
  config = _ios.ios.withPodfilePostInstall(config);
  return config;
};
var _default = exports.default = (0, _configPlugins.createRunOncePlugin)(withMapLibre, pkg.name, pkg.version);
//# sourceMappingURL=withMapLibre.js.map