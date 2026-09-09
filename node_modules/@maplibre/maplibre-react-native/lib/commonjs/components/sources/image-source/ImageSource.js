"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ImageSource = void 0;
var _react = require("react");
var _ImageSourceNativeComponent = _interopRequireDefault(require("./ImageSourceNativeComponent"));
var _useFrozenId = require("../../../hooks/useFrozenId.js");
var _index = require("../../../utils/index.js");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * ImageSource is a content source that is used for a georeferenced raster image
 * to be shown on the map. The georeferenced image scales and rotates as the
 * user zooms and rotates the map
 */
const ImageSource = exports.ImageSource = /*#__PURE__*/(0, _react.memo)(({
  id,
  url,
  ...props
}) => {
  const frozenId = (0, _useFrozenId.useFrozenId)(id);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_ImageSourceNativeComponent.default, {
    id: frozenId,
    url: (0, _index.isNumber)(url) ? (0, _index.resolveImagePath)(url) : url,
    coordinates: props.coordinates,
    children: (0, _index.cloneReactChildrenWithProps)(props.children, {
      source: frozenId
    })
  });
});
//# sourceMappingURL=ImageSource.js.map