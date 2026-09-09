/**
 * Position anchor for markers and annotations. Follows MapLibre GL JS
 * PositionAnchor format.
 *
 * @see {@link https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/PositionAnchor/}
 */
export type Anchor = "center" | "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
/**
 * Converts an Anchor string to native {x, y} format. x: 0 = left, 0.5 = center,
 * 1 = right y: 0 = top, 0.5 = center, 1 = bottom
 */
export declare function anchorToNative(anchor: Anchor): {
    x: number;
    y: number;
};
//# sourceMappingURL=Anchor.d.ts.map