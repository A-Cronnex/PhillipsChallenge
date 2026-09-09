"use strict";

import { PermissionsAndroid, Platform } from "react-native";
import NativeLocationModule from "./NativeLocationModule.js";
class LocationManager {
  listeners = [];
  currentPosition = undefined;
  isListening = false;
  subscription = undefined;
  constructor() {
    this.handleUpdate = this.handleUpdate.bind(this);
  }
  async getCurrentPosition() {
    let currentPosition;
    try {
      currentPosition = await NativeLocationModule.getCurrentPosition();
    } catch (error) {
      console.log("LocationManager [error]: ", error);
    }
    this.currentPosition = currentPosition;
    return this.currentPosition;
  }
  addListener(newListener) {
    if (!this.isListening) {
      this.start();
    }
    if (!this.listeners.includes(newListener)) {
      this.listeners.push(newListener);
      if (this.currentPosition) {
        newListener(this.currentPosition);
      }
    }
  }
  removeListener(oldListener) {
    this.listeners = this.listeners.filter(listener => listener !== oldListener);
    if (this.listeners.length === 0) {
      this.stop();
    }
  }
  removeAllListeners() {
    this.listeners = [];
    this.stop();
  }
  start() {
    if (!this.isListening) {
      NativeLocationModule.start();
      this.subscription = NativeLocationModule.onUpdate(this.handleUpdate);
      this.isListening = true;
    }
  }
  stop() {
    NativeLocationModule.stop();
    if (this.isListening) {
      this.subscription?.remove();
    }
    this.isListening = false;
  }
  setMinDisplacement(minDisplacement) {
    NativeLocationModule.setMinDisplacement(minDisplacement);
  }
  handleUpdate(location) {
    this.currentPosition = location;
    this.listeners.forEach(listener => listener(location));
  }

  /**
   * Request location permissions
   *
   * Requests the following:
   * - Android: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`
   * - iOS: `requestWhenInUseAuthorization`
   *
   * @returns Promise resolves to true if permissions were granted, false otherwise
   */
  async requestPermissions() {
    if (Platform.OS === "android") {
      const res = await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]);
      return Object.values(res).every(permission => permission === PermissionsAndroid.RESULTS.GRANTED);
    }
    if (Platform.OS === "ios") {
      try {
        await NativeLocationModule.requestPermissions();
        return true;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_error) {
        return false;
      }
    }
    return false;
  }
}
const locationManager = new LocationManager();
export { locationManager as LocationManager };
//# sourceMappingURL=LocationManager.js.map