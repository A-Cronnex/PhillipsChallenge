"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.withGradleProperties = exports.mergeGradleProperties = exports.getGradleProperties = exports.android = exports.GRADLE_PROPERTIES_PREFIX = void 0;
var _configPlugins = require("expo/config-plugins");
const GRADLE_PROPERTIES_PREFIX = exports.GRADLE_PROPERTIES_PREFIX = "org.maplibre.reactnative.";
const getGradleProperties = props => {
  return Object.entries(props?.android || {}).reduce((properties, [key, value]) => {
    if (key && value) {
      properties.push({
        type: "property",
        key: `${GRADLE_PROPERTIES_PREFIX}${key}`,
        value: value.toString()
      });
    }
    return properties;
  }, []);
};
exports.getGradleProperties = getGradleProperties;
const mergeGradleProperties = (oldProperties, newProperties) => {
  const merged = oldProperties.filter(item => !(item.type === "property" && item.key.startsWith(GRADLE_PROPERTIES_PREFIX)));
  merged.push(...newProperties);
  return merged;
};
exports.mergeGradleProperties = mergeGradleProperties;
const withGradleProperties = (config, props) => {
  const gradleProperties = getGradleProperties(props);
  return (0, _configPlugins.withGradleProperties)(config, c => {
    c.modResults = mergeGradleProperties(c.modResults, gradleProperties);
    return c;
  });
};
exports.withGradleProperties = withGradleProperties;
const android = exports.android = {
  withGradleProperties
};
//# sourceMappingURL=android.js.map