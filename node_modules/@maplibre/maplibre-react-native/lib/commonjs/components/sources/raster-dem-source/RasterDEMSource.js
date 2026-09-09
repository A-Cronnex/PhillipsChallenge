"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RasterDEMSource = void 0;
var _react = require("react");
var _RasterDEMSourceNativeComponent = _interopRequireDefault(require("./RasterDEMSourceNativeComponent"));
var _useFrozenId = require("../../../hooks/useFrozenId.js");
var _index = require("../../../utils/index.js");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * RasterDEMSource is a map content source that supplies rasterized digital
 * elevation model (DEM) tiles to be shown on the map. Use it together with a
 * hillshade layer to visualize terrain.
 */
const RasterDEMSource = exports.RasterDEMSource = /*#__PURE__*/(0, _react.memo)(({
  id,
  ...props
}) => {
  const frozenId = (0, _useFrozenId.useFrozenId)(id);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_RasterDEMSourceNativeComponent.default, {
    id: frozenId,
    ...props,
    children: (0, _index.cloneReactChildrenWithProps)(props.children, {
      source: frozenId
    })
  });
});
//# sourceMappingURL=RasterDEMSource.js.map