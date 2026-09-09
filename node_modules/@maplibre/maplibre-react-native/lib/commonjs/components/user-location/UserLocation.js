"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.UserLocation = void 0;
var _react = require("react");
var _UserLocationPuck = require("./UserLocationPuck.js");
var _heading = _interopRequireDefault(require("../../assets/heading.png"));
var _useCurrentPosition = require("../../hooks/useCurrentPosition.js");
var _LayerAnnotation = require("../annotations/LayerAnnotation.js");
var _Images = require("../images/Images.js");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const UserLocation = exports.UserLocation = /*#__PURE__*/(0, _react.memo)(({
  animated = true,
  accuracy = false,
  heading = false,
  minDisplacement,
  children,
  onPress
}) => {
  const currentPosition = (0, _useCurrentPosition.useCurrentPosition)({
    minDisplacement
  });
  const lngLat = (0, _react.useMemo)(() => {
    return currentPosition?.coords ? [currentPosition.coords.longitude, currentPosition.coords.latitude] : undefined;
  }, [currentPosition?.coords]);
  if (!lngLat || !currentPosition) {
    return null;
  }
  return /*#__PURE__*/(0, _jsxRuntime.jsxs)(_jsxRuntime.Fragment, {
    children: [heading && /*#__PURE__*/(0, _jsxRuntime.jsx)(_Images.Images, {
      images: {
        "mlrn-user-location-puck-heading": _heading.default
      }
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)(_LayerAnnotation.LayerAnnotation, {
      animated: animated,
      id: "mlrn-user-location",
      testID: "mlrn-user-location",
      onPress: onPress,
      lngLat: lngLat,
      children: children || /*#__PURE__*/(0, _jsxRuntime.jsx)(_UserLocationPuck.UserLocationPuck, {
        testID: "mlrn-user-location-puck",
        source: "mlrn-user-location",
        accuracy: accuracy ? currentPosition.coords.accuracy : undefined,
        heading: heading ? currentPosition.coords.heading ?? undefined : undefined
      })
    })]
  });
});
//# sourceMappingURL=UserLocation.js.map