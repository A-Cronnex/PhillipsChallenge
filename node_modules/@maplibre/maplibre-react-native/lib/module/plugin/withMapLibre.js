"use strict";

import { createRunOncePlugin } from "expo/config-plugins";
import { android } from "./android.js";
import { ios } from "./ios.js";
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
  config = android.withGradleProperties(config, props);

  // iOS
  config = ios.withDwarfDsym(config);
  config = ios.withPodfileGlobalVariables(config, props);
  config = ios.withPodfilePostInstall(config);
  return config;
};
export default createRunOncePlugin(withMapLibre, pkg.name, pkg.version);
//# sourceMappingURL=withMapLibre.js.map