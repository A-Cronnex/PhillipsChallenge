"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Marker = void 0;
var _react = require("react");
var _reactNative = require("react-native");
var _MarkerViewNativeComponent = _interopRequireDefault(require("./MarkerViewNativeComponent"));
var _useFrozenId = require("../../../hooks/useFrozenId.js");
var _Anchor = require("../../../types/Anchor.js");
var _ViewAnnotation = require("../view-annotation/ViewAnnotation.js");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * Event emitted by a Marker on press.
 */

/**
 * Marker allows you to place an interactive React Native View on the map.
 *
 * If you have static view consider using ViewAnnotation or SymbolLayer for
 * better performance.
 *
 * Implemented through:
 * - Android: Native Views placed on the map projection
 * - iOS:
 *   [MLNPointAnnotation](https://maplibre.org/maplibre-native/ios/latest/documentation/maplibre/mlnpointannotation/)
 */
const Marker = ({
  id,
  anchor = "center",
  offset,
  ref,
  ...props
}) => {
  const nativeRef = (0, _react.useRef)(null);
  const viewAnnotationRef = (0, _react.useRef)(null);
  const nativeAnchor = (0, _Anchor.anchorToNative)(anchor);
  const nativeOffset = offset ? {
    x: offset[0],
    y: offset[1]
  } : undefined;
  const frozenId = (0, _useFrozenId.useFrozenId)(id);
  (0, _react.useImperativeHandle)(ref, () => ({
    // Reanimated v4 compatibility: createAnimatedComponent looks for _viewConfig but native has __viewConfig
    getAnimatableRef: () => {
      if (_reactNative.Platform.OS === "ios") {
        return viewAnnotationRef.current?.getAnimatableRef();
      }
      return nativeRef.current ? new Proxy(nativeRef.current, {
        get: (target, prop) => prop === "_viewConfig" ? target.__viewConfig : target[prop]
      }) : null;
    }
  }));
  if (_reactNative.Platform.OS === "ios") {
    return /*#__PURE__*/(0, _jsxRuntime.jsx)(_ViewAnnotation.ViewAnnotation, {
      ref: viewAnnotationRef,
      id: frozenId,
      anchor: anchor,
      offset: offset,
      ...props
    });
  }
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_MarkerViewNativeComponent.default, {
    ref: nativeRef,
    id: frozenId,
    anchor: nativeAnchor,
    offset: nativeOffset,
    ...props,
    style: [{
      flex: 0,
      alignSelf: "flex-start",
      overflow: "visible"
    }, props.style],
    children: /*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNative.View, {
      collapsable: false,
      style: {
        flex: 0,
        alignSelf: "flex-start",
        overflow: "visible"
      },
      children: props.children
    })
  });
};
exports.Marker = Marker;
//# sourceMappingURL=Marker.js.map