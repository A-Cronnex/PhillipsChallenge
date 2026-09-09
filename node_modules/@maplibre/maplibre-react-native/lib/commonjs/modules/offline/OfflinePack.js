"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.OfflinePack = void 0;
var _NativeOfflineModule = _interopRequireDefault(require("./NativeOfflineModule.js"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
class OfflinePack {
  /** Unique Identifier (UUID), auto-generated natively during creation. */

  /** User-provided metadata object. */

  constructor(pack) {
    this.id = pack.id;
    this.bounds = pack.bounds;
    this.metadata = JSON.parse(pack.metadata);
  }
  async status() {
    return _NativeOfflineModule.default.getPackStatus(this.id);
  }
  async resume() {
    return _NativeOfflineModule.default.resumePackDownload(this.id);
  }
  async pause() {
    return _NativeOfflineModule.default.pausePackDownload(this.id);
  }
}
exports.OfflinePack = OfflinePack;
//# sourceMappingURL=OfflinePack.js.map