"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.BridgeValue = void 0;
var _index = require("./index.js");
class BridgeValue {
  constructor(rawValue) {
    this.rawValue = rawValue;
  }
  get type() {
    if (Array.isArray(this.rawValue)) {
      return "array";
    }
    if ((0, _index.isBoolean)(this.rawValue)) {
      return "boolean";
    }
    if ((0, _index.isNumber)(this.rawValue)) {
      return "number";
    }
    if ((0, _index.isString)(this.rawValue)) {
      return "string";
    }
    if (this.rawValue && typeof this.rawValue === "object") {
      return "hashmap";
    }
    throw new Error(`[type - ${this.rawValue}] BridgeValue must be a primitive/array/object`);
  }
  get value() {
    const {
      type
    } = this;
    let value;
    if (type === "array") {
      value = [];
      for (const innerRawValue of this.rawValue) {
        const bridgeValue = new BridgeValue(innerRawValue);
        value.push(bridgeValue.toJSON());
      }
    } else if (type === "hashmap") {
      const rawValue = this.rawValue;
      value = Object.entries(rawValue).map(([key, value]) => [new BridgeValue(key).toJSON(), new BridgeValue(value).toJSON()]);
    } else if (type === "boolean" || type === "number" || type === "string") {
      value = this.rawValue;
    } else {
      throw new Error(`[value - ${this.rawValue}] BridgeValue must be a primitive/array/object`);
    }
    return value;
  }
  toJSON(formatter) {
    return {
      type: this.type,
      value: typeof formatter === "function" ? formatter(this.value) : this.value
    };
  }
}
exports.BridgeValue = BridgeValue;
//# sourceMappingURL=BridgeValue.js.map