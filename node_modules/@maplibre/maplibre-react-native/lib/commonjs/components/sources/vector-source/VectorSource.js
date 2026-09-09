"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.VectorSource = void 0;
var _react = require("react");
var _NativeVectorSourceModule = _interopRequireDefault(require("./NativeVectorSourceModule.js"));
var _VectorSourceNativeComponent = _interopRequireDefault(require("./VectorSourceNativeComponent"));
var _useFrozenId = require("../../../hooks/useFrozenId.js");
var _index = require("../../../utils/index.js");
var _findNodeHandle = require("../../../utils/findNodeHandle.js");
var _getNativeFilter = require("../../../utils/getNativeFilter.js");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * VectorSource is a map content source that supplies tiled vector data in
 * Mapbox Vector Tile format to be shown on the map. The location of and
 * metadata about the tiles are defined either by an option dictionary or by an
 * external file that conforms to the TileJSON specification.
 */
const VectorSource = exports.VectorSource = /*#__PURE__*/(0, _react.memo)(({
  id,
  ref,
  ...props
}) => {
  const nativeRef = (0, _react.useRef)(null);
  const frozenId = (0, _useFrozenId.useFrozenId)(id);
  (0, _react.useImperativeHandle)(ref, () => ({
    querySourceFeatures: async ({
      sourceLayer,
      filter
    }) => {
      return _NativeVectorSourceModule.default.querySourceFeatures((0, _findNodeHandle.findNodeHandle)(nativeRef.current), sourceLayer, (0, _getNativeFilter.getNativeFilter)(filter));
    }
  }));
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_VectorSourceNativeComponent.default, {
    ref: nativeRef,
    id: frozenId,
    hasOnPress: !!props.onPress,
    ...props,
    children: (0, _index.cloneReactChildrenWithProps)(props.children, {
      source: frozenId
    })
  });
});
//# sourceMappingURL=VectorSource.js.map