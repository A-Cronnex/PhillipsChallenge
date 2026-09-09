"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Map = void 0;
var _react = require("react");
var _reactNative = require("react-native");
var _AndroidTextureMapViewNativeComponent = _interopRequireDefault(require("./AndroidTextureMapViewNativeComponent"));
var _MapViewNativeComponent = _interopRequireDefault(require("./MapViewNativeComponent"));
var _NativeMapViewModule = _interopRequireDefault(require("./NativeMapViewModule.js"));
var _LogManager = require("../../modules/log/LogManager.js");
var _StyleValue = require("../../utils/StyleValue.js");
var _convertStyleSpec = require("../../utils/convertStyleSpec.js");
var _findNodeHandle = require("../../utils/findNodeHandle.js");
var _getNativeFilter = require("../../utils/getNativeFilter.js");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const styles = _reactNative.StyleSheet.create({
  flex1: {
    flex: 1
  }
});

/**
 * Screen position for map ornaments (logo, compass, scale bar). Exactly one of
 * `top` / `bottom` and one of `left` / `right` must be provided.
 */

/**
 * Current viewport state of the map.
 */

/**
 * Event emitted when the map viewport changes (pan, zoom, rotate, pitch).
 */

/**
 * Options for querying rendered features at a screen point or within a bounding
 * box.
 */

/**
 * A view of a MapLibre Native Map.
 *
 * @example Rendering a basic Map
 * ```tsx
 * <Map mapStyle="https://demotiles.maplibre.org/style.json" />;
 * ```
 */
const Map = exports.Map = /*#__PURE__*/(0, _react.memo)(({
  androidView = "surface",
  style,
  ref,
  ...props
}) => {
  const [isReady, setIsReady] = (0, _react.useState)(false);
  const nativeRef = (0, _react.useRef)(null);
  (0, _react.useImperativeHandle)(ref, () => ({
    getCenter: () => _NativeMapViewModule.default.getCenter((0, _findNodeHandle.findNodeHandle)(nativeRef.current)),
    getZoom: () => _NativeMapViewModule.default.getZoom((0, _findNodeHandle.findNodeHandle)(nativeRef.current)),
    getBearing: () => _NativeMapViewModule.default.getBearing((0, _findNodeHandle.findNodeHandle)(nativeRef.current)),
    getPitch: () => _NativeMapViewModule.default.getPitch((0, _findNodeHandle.findNodeHandle)(nativeRef.current)),
    getBounds: () => _NativeMapViewModule.default.getBounds((0, _findNodeHandle.findNodeHandle)(nativeRef.current)),
    getViewState: () => _NativeMapViewModule.default.getViewState((0, _findNodeHandle.findNodeHandle)(nativeRef.current)),
    project: lngLat => _NativeMapViewModule.default.project((0, _findNodeHandle.findNodeHandle)(nativeRef.current), lngLat),
    unproject: point => _NativeMapViewModule.default.unproject((0, _findNodeHandle.findNodeHandle)(nativeRef.current), point),
    queryRenderedFeatures: async (pixelPointOrPixelPointBoundsOrOptions, options) => {
      if (pixelPointOrPixelPointBoundsOrOptions && Array.isArray(pixelPointOrPixelPointBoundsOrOptions) && (value => typeof value[0] === "number" && typeof value[1] === "number")(pixelPointOrPixelPointBoundsOrOptions)) {
        return await _NativeMapViewModule.default.queryRenderedFeaturesWithPoint((0, _findNodeHandle.findNodeHandle)(nativeRef.current), pixelPointOrPixelPointBoundsOrOptions, options?.layers ?? [], (0, _getNativeFilter.getNativeFilter)(options?.filter));
      } else if (pixelPointOrPixelPointBoundsOrOptions && Array.isArray(pixelPointOrPixelPointBoundsOrOptions) && (value => Array.isArray(value[0]) && Array.isArray(value[1]))(pixelPointOrPixelPointBoundsOrOptions)) {
        return await _NativeMapViewModule.default.queryRenderedFeaturesWithBounds((0, _findNodeHandle.findNodeHandle)(nativeRef.current), pixelPointOrPixelPointBoundsOrOptions, options?.layers ?? [], (0, _getNativeFilter.getNativeFilter)(options?.filter));
      } else {
        return await _NativeMapViewModule.default.queryRenderedFeaturesWithBounds((0, _findNodeHandle.findNodeHandle)(nativeRef.current), null, pixelPointOrPixelPointBoundsOrOptions?.layers ?? [], (0, _getNativeFilter.getNativeFilter)(pixelPointOrPixelPointBoundsOrOptions?.filter));
      }
    },
    createStaticMapImage: options => _NativeMapViewModule.default.createStaticMapImage((0, _findNodeHandle.findNodeHandle)(nativeRef.current), options.output),
    setSourceVisibility: (visible, source, sourceLayer) => _NativeMapViewModule.default.setSourceVisibility((0, _findNodeHandle.findNodeHandle)(nativeRef.current), visible, source, sourceLayer ?? null),
    showAttribution: () => _NativeMapViewModule.default.showAttribution((0, _findNodeHandle.findNodeHandle)(nativeRef.current))
  }));

  // Start before rendering
  (0, _react.useLayoutEffect)(() => {
    _LogManager.LogManager.start();
    return () => {
      _LogManager.LogManager.stop();
    };
  }, []);
  const nativeProps = (0, _react.useMemo)(() => {
    const {
      mapStyle,
      light,
      ...otherProps
    } = props;
    return {
      ...otherProps,
      ref: nativeRef,
      style: styles.flex1,
      mapStyle: typeof mapStyle === "object" ? JSON.stringify(mapStyle) : mapStyle,
      light: props.light ? (0, _StyleValue.transformStyle)((0, _convertStyleSpec.convertToInternalStyle)(props.light)) : undefined
    };
  }, [props]);
  let map = null;
  if (isReady) {
    const NativeMapView = _reactNative.Platform.OS === "android" && androidView === "texture" ? _AndroidTextureMapViewNativeComponent.default : _MapViewNativeComponent.default;
    map = /*#__PURE__*/(0, _jsxRuntime.jsx)(NativeMapView, {
      ...nativeProps
    });
  }
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNative.View, {
    onLayout: () => setIsReady(true),
    style: style ?? styles.flex1,
    testID: nativeProps.testID ? `${nativeProps.testID}-view` : undefined,
    children: map
  });
});
//# sourceMappingURL=Map.js.map