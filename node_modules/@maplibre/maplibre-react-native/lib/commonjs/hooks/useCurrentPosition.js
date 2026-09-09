"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useCurrentPosition = useCurrentPosition;
var _react = require("react");
var _LocationManager = require("../modules/location/LocationManager.js");
function useCurrentPosition({
  enabled = true,
  minDisplacement
} = {}) {
  const [currentPosition, setCurrentPosition] = (0, _react.useState)();
  (0, _react.useEffect)(() => {
    if (minDisplacement !== undefined) {
      _LocationManager.LocationManager.setMinDisplacement(minDisplacement);
    }
  }, [minDisplacement]);
  const handleUpdate = (0, _react.useCallback)(position => {
    setCurrentPosition(position);
  }, []);
  (0, _react.useEffect)(() => {
    if (enabled) {
      _LocationManager.LocationManager.addListener(handleUpdate);
    }
    return () => {
      if (enabled) {
        _LocationManager.LocationManager.removeListener(handleUpdate);
      }
    };
  }, [enabled, handleUpdate]);
  return currentPosition;
}
//# sourceMappingURL=useCurrentPosition.js.map