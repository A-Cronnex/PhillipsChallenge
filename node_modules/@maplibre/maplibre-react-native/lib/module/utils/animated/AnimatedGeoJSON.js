"use strict";

import { Animated } from "react-native";
const AnimatedWithChildren = Object.getPrototypeOf(Animated.ValueXY);
/**
 * AnimatedGeoJSON can be used to have animated properties inside the data
 * property
 *
 * Equivalent of AnimatedStyle for GeoJSON
 * https://github.com/facebook/react-native/blob/main/packages/react-native/Libraries/Animated/nodes/AnimatedStyle.js
 *
 * @example
 * <AnimatedGeoJSONSource ... data={new AnimatedGeoJSON({type:'LineString', coordinates: animatedCoords})} />
 */
export class AnimatedGeoJSON extends AnimatedWithChildren {
  constructor(valueIn) {
    super();
    this.geojson = valueIn;
  }
  walkGeoJSONAndGetValues(value) {
    if (Array.isArray(value)) {
      return value.map(i => this.walkGeoJSONAndGetValues(i));
    }
    if (value instanceof AnimatedWithChildren) {
      return value.__getValue();
    }
    if (typeof value === "object") {
      const result = {};
      for (const key in value) {
        result[key] = this.walkGeoJSONAndGetValues(value[key]);
      }
      return result;
    }
    return value;
  }
  walkAndProcess(value, cb) {
    if (Array.isArray(value)) {
      value.forEach(i => this.walkAndProcess(i, cb));
    } else if (value instanceof AnimatedWithChildren) {
      cb(value);
    } else if (typeof value === "object") {
      for (const key in value) {
        this.walkAndProcess(value[key], cb);
      }
    }
  }
  __getValue() {
    const geojson = this.walkGeoJSONAndGetValues(this.geojson);
    if (geojson.type === "LineString" && geojson.coordinates.length === 1) {
      geojson.coordinates = [...geojson.coordinates, ...geojson.coordinates];
    }
    return geojson;
  }
  __attach() {
    this.walkAndProcess(this.geojson, v => v.__addChild(this));
  }
  __detach() {
    this.walkAndProcess(this.geojson, v => v.__removeChild(this));
    super.__detach();
  }
}
//# sourceMappingURL=AnimatedGeoJSON.js.map