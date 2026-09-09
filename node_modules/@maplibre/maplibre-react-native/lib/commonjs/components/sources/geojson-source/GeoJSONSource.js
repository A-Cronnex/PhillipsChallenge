"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GeoJSONSource = void 0;
var _react = require("react");
var _GeoJSONSourceNativeComponent = _interopRequireDefault(require("./GeoJSONSourceNativeComponent"));
var _NativeGeoJSONSourceModule = _interopRequireDefault(require("./NativeGeoJSONSourceModule.js"));
var _useFrozenId = require("../../../hooks/useFrozenId.js");
var _index = require("../../../utils/index.js");
var _findNodeHandle = require("../../../utils/findNodeHandle.js");
var _getNativeFilter = require("../../../utils/getNativeFilter.js");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * GeoJSONSource is a map content source that supplies GeoJSON to be shown on
 * the map. The data may be provided as an url or a GeoJSON object.
 */
const GeoJSONSource = exports.GeoJSONSource = /*#__PURE__*/(0, _react.memo)(({
  id,
  data,
  ref,
  ...props
}) => {
  const nativeRef = (0, _react.useRef)(null);
  const frozenId = (0, _useFrozenId.useFrozenId)(id);
  (0, _react.useImperativeHandle)(ref, () => ({
    getData: async filter => {
      return _NativeGeoJSONSourceModule.default.getData((0, _findNodeHandle.findNodeHandle)(nativeRef.current), (0, _getNativeFilter.getNativeFilter)(filter));
    },
    getClusterExpansionZoom: async clusterId => {
      return _NativeGeoJSONSourceModule.default.getClusterExpansionZoom((0, _findNodeHandle.findNodeHandle)(nativeRef.current), clusterId);
    },
    getClusterLeaves: async (clusterId, limit, offset) => {
      return _NativeGeoJSONSourceModule.default.getClusterLeaves((0, _findNodeHandle.findNodeHandle)(nativeRef.current), clusterId, limit, offset);
    },
    getClusterChildren: async clusterId => {
      return _NativeGeoJSONSourceModule.default.getClusterChildren((0, _findNodeHandle.findNodeHandle)(nativeRef.current), clusterId);
    },
    getAnimatableRef: () => nativeRef.current ? new Proxy(nativeRef.current, {
      get: (target, prop) => prop === "_viewConfig" ? target.__viewConfig : target[prop]
    }) : null
  }));
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_GeoJSONSourceNativeComponent.default, {
    ref: nativeRef,
    id: frozenId,
    data: typeof data === "string" ? data : JSON.stringify(data),
    hasOnPress: !!props.onPress,
    ...props,
    children: (0, _index.cloneReactChildrenWithProps)(props.children, {
      source: frozenId
    })
  });
});
//# sourceMappingURL=GeoJSONSource.js.map