import { Component, type ComponentProps, type ReactElement, type Ref } from "react";
import { type NativeSyntheticEvent, type ReactNativeElement, type ViewProps } from "react-native";
import MarkerViewNativeComponent from "./MarkerViewNativeComponent";
import { type Anchor } from "../../../types/Anchor";
import type { LngLat } from "../../../types/LngLat";
import type { PixelPoint } from "../../../types/PixelPoint";
import type { PressEvent } from "../../../types/PressEvent";
export type NativeMarkerRef = Component<ComponentProps<typeof MarkerViewNativeComponent>> & ReactNativeElement;
/**
 * Event emitted by a Marker on press.
 */
export type MarkerEvent = PressEvent & {
    id: string;
};
export interface MarkerRef {
    /**
     * Returns the native ref for Reanimated v4 compatibility.
     */
    getAnimatableRef(): NativeMarkerRef | null;
}
export interface MarkerProps extends ViewProps {
    /**
     * A string that uniquely identifies the marker.
     */
    id?: string;
    /**
     * The center point (specified as a map coordinate) of the marker. See also
     * #anchor.
     */
    lngLat: LngLat;
    /**
     * Specifies the anchor being set on a particular point of the annotation. The
     * anchor indicates which part of the marker should be placed closest to the
     * coordinate.
     *
     * @see {@link https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/PositionAnchor/}
     * @defaultValue "center"
     */
    anchor?: Anchor;
    /**
     * The offset in pixels to apply relative to the anchor. Negative values
     * indicate left and up.
     *
     * @see {@link https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MarkerOptions/#offset}
     * @defaultValue [0, 0]
     */
    offset?: PixelPoint;
    /**
     * Manually selects/deselects the marker.
     *
     * @platform iOS
     */
    selected?: boolean;
    /**
     * This callback is fired when the marker is pressed.
     */
    onPress?: (event: NativeSyntheticEvent<MarkerEvent>) => void;
    /**
     * Expects one child - can be a View with multiple elements.
     */
    children: ReactElement;
    /**
     * Ref to access Marker methods.
     */
    ref?: Ref<MarkerRef>;
}
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
export declare const Marker: ({ id, anchor, offset, ref, ...props }: MarkerProps) => import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Marker.d.ts.map