"use strict";

import NativeLogModule from "./NativeLogModule.js";

/**
 * Log levels in decreasing order of severity
 */

/**
 * Handler for `onLog` events
 *
 * Called before logging a message, return false to proceed with default
 * logging.
 *
 * @param event -
 */

class LogManager {
  logLevel = "warn";
  startedCount = 0;
  logHandler = undefined;
  subscription = undefined;
  constructor() {
    this.handleLog = this.handleLog.bind(this);
  }

  /**
   * Override logging behavior
   *
   * @param logHandler -
   */
  onLog(logHandler) {
    this.logHandler = logHandler;
  }

  /**
   * Set the minimum log level for a message to be logged
   *
   * @param level - Minimum log level
   */
  setLogLevel(level) {
    this.logLevel = level;
    NativeLogModule.setLogLevel(level);
  }
  start() {
    if (this.startedCount === 0) {
      this.subscribe();
    }
    this.startedCount += 1;
  }
  stop() {
    this.startedCount -= 1;
    if (this.startedCount === 0) {
      this.unsubscribe();
    }
  }
  subscribe() {
    this.subscription = NativeLogModule.onLog(this.handleLog);
  }
  unsubscribe() {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = undefined;
    }
  }
  effectiveLevel({
    level,
    message,
    tag
  }) {
    // Reduce level of cancelled HTTP requests from warn to info
    if (level === "warn" && tag === "Mbgl-HttpRequest" && message.startsWith("Request failed due to a permanent error: Canceled")) {
      return "info";
    }
    return level;
  }
  handleLog(log) {
    if (!this.logHandler || !this.logHandler(log)) {
      const {
        message,
        tag
      } = log;
      const level = this.effectiveLevel(log);
      const consoleMessage = `MapLibre Native [${level.toUpperCase()}] [${tag}] ${message}`;
      if (level === "error") {
        console.error(consoleMessage);
      } else if (level === "warn" && this.logLevel !== "error") {
        console.warn(consoleMessage);
      } else if (this.logLevel !== "error" && this.logLevel !== "warn") {
        console.info(consoleMessage);
      }
    }
  }
}
const logManager = new LogManager();
export { logManager as LogManager };
//# sourceMappingURL=LogManager.js.map