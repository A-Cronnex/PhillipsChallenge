"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useNativeBridge = void 0;
var _react = require("react");
var _index = require("../utils/index.js");
let callbackIncrement = 0;
const useNativeBridge = _nativeModuleName => {
  const _callbackMap = (0, _react.useRef)(new Map());
  const _preRefMapMethodQueue = (0, _react.useRef)([]);
  const _addAddAndroidCallback = (id, resolve, reject) => {
    _callbackMap.current.set(id, {
      resolve,
      reject
    });
  };
  const _removeAndroidCallback = id => {
    _callbackMap.current.delete(id);
  };
  const _onAndroidCallback = e => {
    const callbackID = e.nativeEvent.type;
    const callback = _callbackMap.current.get(callbackID);
    if (!callback) {
      return;
    }
    _callbackMap.current.delete(callbackID);
    const {
      payload
    } = e.nativeEvent;
    if (payload.error) {
      callback.reject.call(null, new Error(payload.error));
    } else {
      callback.resolve.call(null, payload);
    }
  };
  const _runPendingNativeCommands = async nativeRef => {
    if (nativeRef) {
      while (_preRefMapMethodQueue.current.length > 0) {
        const item = _preRefMapMethodQueue.current.pop();
        if (item && item.method && item.resolver) {
          const res = await _runNativeCommand(item.method.name, nativeRef, item.method.args);
          item.resolver(res);
        }
      }
    }
  };
  const _runNativeCommand = (methodName, nativeRef, args = []) => {
    if (!nativeRef) {
      return new Promise(resolve => {
        _preRefMapMethodQueue.current.push({
          method: {
            name: methodName,
            args
          },
          resolver: resolve
        });
      });
    }
    if ((0, _index.isAndroid)()) {
      return new Promise((resolve, reject) => {
        callbackIncrement += 1;
        const callbackID = `${methodName}_${callbackIncrement}`;
        _addAddAndroidCallback(callbackID, resolve, reject);
        args.unshift(callbackID);
        (0, _index.runNativeCommand)(_nativeModuleName, methodName, nativeRef, args);
      });
    }
    return (0, _index.runNativeCommand)(_nativeModuleName, methodName, nativeRef, args);
  };
  return {
    _nativeModuleName,
    _onAndroidCallback,
    _callbackMap,
    _preRefMapMethodQueue,
    _addAddAndroidCallback,
    _removeAndroidCallback,
    _runPendingNativeCommands,
    _runNativeCommand
  };
};
exports.useNativeBridge = useNativeBridge;
//# sourceMappingURL=useNativeBridge.js.map