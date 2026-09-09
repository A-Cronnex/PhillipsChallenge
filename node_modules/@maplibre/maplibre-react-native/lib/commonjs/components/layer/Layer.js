"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Layer = void 0;
var _react = require("react");
var _LayerNativeComponent = _interopRequireDefault(require("./LayerNativeComponent"));
var _useFrozenId = require("../../hooks/useFrozenId.js");
var _StyleValue = require("../../utils/StyleValue.js");
var _convertStyleSpec = require("../../utils/convertStyleSpec.js");
var _getNativeFilter = require("../../utils/getNativeFilter.js");
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
let deprecationWarned = false;

/**
 * Additional props specific to @maplibre/maplibre-react-native.
 */

// Utility types following react-map-gl pattern
// See: https://github.com/microsoft/TypeScript/issues/39556#issuecomment-656925230

/**
 * Base layer props from style spec with optional `id`/`source`.
 */

/**
 * Common props shared by all layer types.
 *
 * @deprecated Use `paint` and `layout` props instead of `style`. The `style` prop be removed in v12.
 */

/**
 * @deprecated Use `LayerProps` instead.
 */

/**
 * @deprecated Use `layout`/`paint` instead of `style` prop.
 */

/**
 * @deprecated Use `layout`/`paint` instead of `style` prop.
 */

/**
 * @deprecated Use `layout`/`paint` instead of `style` prop.
 */

/**
 * @deprecated Use `layout`/`paint` instead of `style` prop.
 */

/**
 * @deprecated Use `layout`/`paint` instead of `style` prop.
 */

/**
 * @deprecated Use `layout`/`paint` instead of `style` prop.
 */

/**
 * @deprecated Use `layout`/`paint` instead of `style` prop.
 */

/**
 * @deprecated Use `layout`/`paint` instead of `style` prop.
 */

/**
 * Layer is a style layer that renders geospatial data on the map.
 *
 * Follow the [MapLibre Style
 * Spec](https://maplibre.org/maplibre-style-spec/layers/) for Layer
 * definitions.
 *
 * @example Basic Usage
 * ```tsx
 * <Layer
 *   type="fill"
 *   id="parks"
 *   source="parks-source"
 *   paint={{ "fill-color": "green", "fill-opacity": 0.5 }}
 *   layout={{ visibility: "visible" }}
 * />;
 * ```
 *
 * @example Using Expressions
 * ```tsx
 * <Layer
 *   type="fill"
 *   id="parks"
 *   source="parks-source"
 *   paint={{
 *     "fill-color": [
 *       "interpolate",
 *       ["linear"],
 *       ["get", "elevation"],
 *       0,
 *       "blue",
 *       100,
 *       "red",
 *     ],
 *   }}
 * />;
 * ```
 */
const Layer = ({
  id,
  ...props
}) => {
  const frozenId = (0, _useFrozenId.useFrozenId)(id);
  const nativeProps = (0, _react.useMemo)(() => {
    const {
      type: layerType,
      "source-layer": sourceLayer,
      filter,
      style,
      paint,
      layout,
      beforeId,
      afterId,
      layerIndex,
      ...rest
    } = {
      "source-layer": undefined,
      filter: undefined,
      paint: undefined,
      layout: undefined,
      ...props
    };
    if (__DEV__ && style && !deprecationWarned) {
      // eslint-disable-next-line react-hooks/globals
      deprecationWarned = true;
      console.warn("[@maplibre/maplibre-react-native] The `style` prop is deprecated. " + "Use `paint` and `layout` props instead. `style` will be removed in v12.");
    }

    // Merge paint/layout (new API) with style (deprecated API)
    const mergedStyle = (0, _convertStyleSpec.mergeStyleProps)(paint, layout, style);
    return {
      ...rest,
      layerType,
      sourceLayer,
      beforeId,
      afterId,
      layerIndex,
      filter: (0, _getNativeFilter.getNativeFilter)(filter),
      reactStyle: (0, _StyleValue.transformStyle)(mergedStyle)
    };
  }, [props]);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_LayerNativeComponent.default, {
    id: frozenId,
    testID: `mlrn-${props.type}-layer`,
    ...nativeProps
  });
};
exports.Layer = Layer;
//# sourceMappingURL=Layer.js.map