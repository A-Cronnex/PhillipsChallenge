"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.LocationManager = void 0;
var _reactNative = require("react-native");
var _NativeLocationModule = _interopRequireDefault(require("./NativeLocationModule.js"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
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
      currentPosition = await _NativeLocationModule.default.getCurrentPosition();
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
      _NativeLocationModule.default.start();
      this.subscription = _NativeLocationModule.default.onUpdate(this.handleUpdate);
      this.isListening = true;
    }
  }
  stop() {
    _NativeLocationModule.default.stop();
    if (this.isListening) {
      this.subscription?.remove();
    }
    this.isListening = false;
  }
  setMinDisplacement(minDisplacement) {
    _NativeLocationModule.default.setMinDisplacement(minDisplacement);
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
    if (_reactNative.Platform.OS === "android") {
      const res = await _reactNative.PermissionsAndroid.requestMultiple([_reactNative.PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, _reactNative.PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]);
      return Object.values(res).every(permission => permission === _reactNative.PermissionsAndroid.RESULTS.GRANTED);
    }
    if (_reactNative.Platform.OS === "ios") {
      try {
        await _NativeLocationModule.default.requestPermissions();
        return true;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_error) {
        return false;
      }
    }
    return false;
  }
}
const locationManager = exports.LocationManager = new LocationManager();
//# sourceMappingURL=LocationManager.js.map