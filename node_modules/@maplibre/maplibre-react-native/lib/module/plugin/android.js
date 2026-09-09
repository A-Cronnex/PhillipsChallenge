"use strict";

import { withGradleProperties as withGradlePropertiesExpo } from "expo/config-plugins";
export const GRADLE_PROPERTIES_PREFIX = "org.maplibre.reactnative.";
export const getGradleProperties = props => {
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
export const mergeGradleProperties = (oldProperties, newProperties) => {
  const merged = oldProperties.filter(item => !(item.type === "property" && item.key.startsWith(GRADLE_PROPERTIES_PREFIX)));
  merged.push(...newProperties);
  return merged;
};
export const withGradleProperties = (config, props) => {
  const gradleProperties = getGradleProperties(props);
  return withGradlePropertiesExpo(config, c => {
    c.modResults = mergeGradleProperties(c.modResults, gradleProperties);
    return c;
  });
};
export const android = {
  withGradleProperties
};
//# sourceMappingURL=android.js.map