import { Component, type ComponentProps, type ReactElement, type Ref } from "react";
import { type NativeSyntheticEvent, type ReactNativeElement, type ViewProps } from "react-native";
import PointAnnotationNativeComponent from "./PointAnnotationNativeComponent";
import { type Anchor } from "../../../types/Anchor";
import type { LngLat } from "../../../types/LngLat";
import type { PixelPoint } from "../../../types/PixelPoint";
import type { PressEvent } from "../../../types/PressEvent";
export type NativeViewAnnotationRef = Component<ComponentProps<typeof PointAnnotationNativeComponent>> & ReactNativeElement;
/**
 * Event emitted by a ViewAnnotation on press.
 */
export type ViewAnnotationEvent = PressEvent & {
    id: string;
};
export interface ViewAnnotationProps {
    /**
     * A string that uniquely identifies the annotation. If not provided, a unique
     * ID will be generated automatically.
     */
    id?: string;
    /**
     * The string containing the annotation's title. Note this is required to be set
     * if you want to see a callout appear on iOS.
     */
    title?: string;
    /**
     * The string containing the annotation's snippet(subtitle). Not displayed in
     * the default callout.
     */
    snippet?: string;
    /**
     * Manually selects/deselects annotation
     */
    selected?: boolean;
    /**
     * Enable or disable dragging.
     *
     * @defaultValue false
     */
    draggable?: boolean;
    /**
     * The center point (specified as a map coordinate) of the annotation.
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
     * This callback is fired when the annotation is pressed.
     */
    onPress?: (event: NativeSyntheticEvent<ViewAnnotationEvent>) => void;
    /**
     * This callback is fired once this annotation is selected.
     */
    onSelect?: (event: NativeSyntheticEvent<ViewAnnotationEvent>) => void;
    /**
     * This callback is fired once this annotation is deselected.
     */
    onDeselect?: (event: NativeSyntheticEvent<ViewAnnotationEvent>) => void;
    /**
     * This callback is fired once this annotation has started being dragged.
     */
    onDragStart?: (event: NativeSyntheticEvent<ViewAnnotationEvent>) => void;
    /**
     * This callback is fired once this annotation has stopped being dragged.
     */
    onDragEnd?: (event: NativeSyntheticEvent<ViewAnnotationEvent>) => void;
    /**
     * This callback is fired while this annotation is being dragged.
     */
    onDrag?: (event: NativeSyntheticEvent<ViewAnnotationEvent>) => void;
    style?: ViewProps["style"];
    /**
     * Expects one child, and an optional callout can be added as well
     */
    children: ReactElement | [ReactElement, ReactElement];
    /**
     * Ref to access ViewAnnotation methods.
     */
    ref?: Ref<ViewAnnotationRef>;
}
export interface ViewAnnotationRef {
    /**
     * On android point annotation is rendered offscreen with a canvas into an
     * image. To rerender the image from the current state of the view call refresh.
     * Call this for example from Image#onLoad.
     */
    refresh(): void;
    /**
     * Returns the native ref for Reanimated v4 compatibility.
     */
    getAnimatableRef(): NativeViewAnnotationRef | null;
}
/**
 * ViewAnnotation represents a one-dimensional shape located at a single
 * geographical coordinate.
 *
 * Consider using GeoJSONSource and SymbolLayer instead, if you have many
 * points, and you have static images, they'll offer much better performance.
 *
 * If you need interactive views please use Marker, as with ViewAnnotation on
 * Android child views are rendered onto a bitmap for better performance.
 */
export declare const ViewAnnotation: ({ id, anchor, draggable, offset, ref, ...props }: ViewAnnotationProps) => import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=ViewAnnotation.d.ts.map