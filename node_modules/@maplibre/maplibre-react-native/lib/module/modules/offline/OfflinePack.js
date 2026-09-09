"use strict";

import NativeOfflineModule from "./NativeOfflineModule.js";
export class OfflinePack {
  /** Unique Identifier (UUID), auto-generated natively during creation. */

  /** User-provided metadata object. */

  constructor(pack) {
    this.id = pack.id;
    this.bounds = pack.bounds;
    this.metadata = JSON.parse(pack.metadata);
  }
  async status() {
    return NativeOfflineModule.getPackStatus(this.id);
  }
  async resume() {
    return NativeOfflineModule.resumePackDownload(this.id);
  }
  async pause() {
    return NativeOfflineModule.pausePackDownload(this.id);
  }
}
//# sourceMappingURL=OfflinePack.js.map