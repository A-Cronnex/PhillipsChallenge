"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NetworkManager = void 0;
var _NativeNetworkModule = _interopRequireDefault(require("./NativeNetworkModule.js"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * NetworkManager provides methods for managing and controlling network
 * connectivity.
 */
class NetworkManager {
  /**
   * Android only: Sets the connectivity state of the map. When set to false, the
   * map will not make any network requests and will only use cached tiles. This
   * is useful for implementing offline mode or reducing data usage.
   *
   * @param connected - Whether the map should be connected to the network
   *
   * @example
   * ```ts
   * // Enable offline mode
   * NetworkManager.setConnected(false);
   * // Re-enable network requests
   * NetworkManager.setConnected(true);
   * ```
   */
  static setConnected(connected) {
    _NativeNetworkModule.default.setConnected(connected);
  }
}
exports.NetworkManager = NetworkManager;
//# sourceMappingURL=NetworkManager.js.map