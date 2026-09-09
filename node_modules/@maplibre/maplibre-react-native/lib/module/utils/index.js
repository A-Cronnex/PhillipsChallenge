"use strict";

import { Children, cloneElement } from "react";
import { Image, NativeModules, findNodeHandle, Platform, UIManager } from "react-native";
export function isAndroid() {
  return Platform.OS === "android";
}
export function isFunction(fn) {
  return typeof fn === "function";
}
export function isNumber(num) {
  return typeof num === "number" && !Number.isNaN(num);
}
export function isUndefined(obj) {
  return typeof obj === "undefined";
}
export function isString(str) {
  return typeof str === "string";
}
export function isBoolean(bool) {
  return typeof bool === "boolean";
}
export function runNativeCommand(module, name, nativeRef, args = []) {
  const handle = findNodeHandle(nativeRef);
  if (!handle) {
    throw new Error(`Could not find handle for native ref ${module}.${name}`);
  }
  const managerInstance = isAndroid() ? UIManager.getViewManagerConfig(module) : NativeModules[module];
  if (!managerInstance) {
    throw new Error(`Could not find ${module}`);
  }
  if (isAndroid()) {
    UIManager.dispatchViewManagerCommand(handle, managerInstance.Commands[name], args);

    // Android uses callback instead of return
    return null;
  }
  return managerInstance[name](handle, ...args);
}
export function cloneReactChildrenWithProps(children, propsToAdd = {}) {
  if (!children) {
    return null;
  }
  const foundChildren = Array.isArray(children) ? children : [children];
  const filteredChildren = foundChildren.filter(child => !!child);
  return Children.map(filteredChildren, child => /*#__PURE__*/cloneElement(child, propsToAdd));
}
export function resolveImagePath(imageRef) {
  const res = Image.resolveAssetSource(imageRef);
  return res.uri;
}
export function toJSONString(json = "") {
  return JSON.stringify(json);
}
//# sourceMappingURL=index.js.map