"use strict";

import { useMemo } from "react";
import LayerNativeComponent from "./LayerNativeComponent";
import { useFrozenId } from "../../hooks/useFrozenId.js";
import { transformStyle } from "../../utils/StyleValue.js";
import { mergeStyleProps } from "../../utils/convertStyleSpec.js";
import { getNativeFilter } from "../../utils/getNativeFilter.js";
import { jsx as _jsx } from "react/jsx-runtime";
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
export const Layer = ({
  id,
  ...props
}) => {
  const frozenId = useFrozenId(id);
  const nativeProps = useMemo(() => {
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
    const mergedStyle = mergeStyleProps(paint, layout, style);
    return {
      ...rest,
      layerType,
      sourceLayer,
      beforeId,
      afterId,
      layerIndex,
      filter: getNativeFilter(filter),
      reactStyle: transformStyle(mergedStyle)
    };
  }, [props]);
  return /*#__PURE__*/_jsx(LayerNativeComponent, {
    id: frozenId,
    testID: `mlrn-${props.type}-layer`,
    ...nativeProps
  });
};
//# sourceMappingURL=Layer.js.map