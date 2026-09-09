"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RasterSource = void 0;
var _react = require("react");
var _RasterSourceNativeComponent = _interopRequireDefault(require("./RasterSourceNativeComponent"));
var _useFrozenId = require("../../../hooks/useFrozenId.js");
var _index = require("../../../utils/index.js");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * RasterSource is a map content source that supplies raster image tiles to be
 * shown on the map. The location of and metadata about the tiles are defined
 * either by an option dictionary or by an external file that conforms to the
 * TileJSON specification.
 */
const RasterSource = exports.RasterSource = /*#__PURE__*/(0, _react.memo)(({
  id,
  ...props
}) => {
  const frozenId = (0, _useFrozenId.useFrozenId)(id);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_RasterSourceNativeComponent.default, {
    id: frozenId,
    ...props,
    children: (0, _index.cloneReactChildrenWithProps)(props.children, {
      source: frozenId
    })
  });
});
//# sourceMappingURL=RasterSource.js.map