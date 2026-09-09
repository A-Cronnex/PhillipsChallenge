"use strict";

import { Animated } from "react-native";
let uniqueID = 0;
const AnimatedWithChildren = Object.getPrototypeOf(Animated.ValueXY);
export class AnimatedPoint extends AnimatedWithChildren {
  constructor(valueIn) {
    super();
    const longitudeIn = valueIn?.coordinates[0] ?? 0;
    const latitudeIn = valueIn?.coordinates[1] ?? 0;
    if (longitudeIn instanceof Animated.Value) {
      this.longitude = longitudeIn;
    } else {
      this.longitude = new Animated.Value(longitudeIn);
    }
    if (latitudeIn instanceof Animated.Value) {
      this.latitude = latitudeIn;
    } else {
      this.latitude = new Animated.Value(latitudeIn);
    }
    this._lngLatListeners = {};
  }
  setValue(value) {
    this.longitude.setValue(value.coordinates[0] ?? 0);
    this.latitude.setValue(value.coordinates[1] ?? 0);
  }
  setOffset(offset) {
    this.longitude.setOffset(offset.coordinates[0] ?? 0);
    this.latitude.setOffset(offset.coordinates[1] ?? 0);
  }
  flattenOffset() {
    this.longitude.flattenOffset();
    this.latitude.flattenOffset();
  }
  stopAnimation(callback) {
    this.longitude.stopAnimation();
    this.latitude.stopAnimation();
    if (typeof callback === "function") {
      callback(this.__getValue());
    }
  }
  addListener(callback) {
    uniqueID += 1;
    const id = `${uniqueID}-${Date.now()}`;
    const completeCallback = () => {
      if (typeof callback === "function") {
        callback(this.__getValue());
      }
    };
    this._lngLatListeners[id] = {
      longitude: this.longitude.addListener(completeCallback),
      latitude: this.latitude.addListener(completeCallback)
    };
    return id;
  }
  removeListener(id) {
    const listener = this._lngLatListeners[id];
    if (listener) {
      this.longitude.removeListener(listener.longitude);
      this.latitude.removeListener(listener.latitude);
      delete this._lngLatListeners[id];
    }
  }
  spring({
    toValue,
    ...config
  }) {
    return Animated.parallel([Animated.spring(this.longitude, {
      ...config,
      toValue: toValue.coordinates[0] ?? 0,
      useNativeDriver: false
    }), Animated.spring(this.latitude, {
      ...config,
      toValue: toValue.coordinates[1] ?? 0,
      useNativeDriver: false
    })]);
  }
  timing({
    toValue,
    ...config
  }) {
    return Animated.parallel([Animated.timing(this.longitude, {
      ...config,
      toValue: toValue.coordinates[0] ?? 0,
      useNativeDriver: false
    }), Animated.timing(this.latitude, {
      ...config,
      toValue: toValue.coordinates[1] ?? 0,
      useNativeDriver: false
    })]);
  }
  __getValue() {
    return {
      type: "Point",
      coordinates: [this.longitude.__getValue(), this.latitude.__getValue()]
    };
  }
  __attach() {
    this.longitude.__addChild(this);
    this.latitude.__addChild(this);
  }
  __detach() {
    this.longitude.__removeChild(this);
    this.latitude.__removeChild(this);
    // @ts-ignore
    super.__detach();
  }
}
//# sourceMappingURL=AnimatedPoint.js.map