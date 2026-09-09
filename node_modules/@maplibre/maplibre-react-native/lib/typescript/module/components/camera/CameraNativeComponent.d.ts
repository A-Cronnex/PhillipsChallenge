import { type CodegenTypes, type HostComponent, type ViewProps } from "react-native";
import type { UnsafeMixed } from "../../types/codegen/UnsafeMixed";
type NativeViewPadding = {
    top?: CodegenTypes.WithDefault<CodegenTypes.Int32, 0>;
    right?: CodegenTypes.WithDefault<CodegenTypes.Int32, 0>;
    bottom?: CodegenTypes.WithDefault<CodegenTypes.Int32, 0>;
    left?: CodegenTypes.WithDefault<CodegenTypes.Int32, 0>;
};
type NativeViewState = {
    center?: CodegenTypes.Double[];
    bounds?: CodegenTypes.Double[];
    padding?: NativeViewPadding;
    zoom?: CodegenTypes.WithDefault<CodegenTypes.Double, -1>;
    bearing?: CodegenTypes.WithDefault<CodegenTypes.Double, -1>;
    pitch?: CodegenTypes.WithDefault<CodegenTypes.Double, -1>;
};
type NativeEasingMode = "none" | "linear" | "ease" | "fly";
type NativeCameraStop = NativeViewState & {
    duration?: CodegenTypes.WithDefault<CodegenTypes.Int32, -1>;
    easing?: CodegenTypes.WithDefault<NativeEasingMode, "none">;
};
type NativeTrackUserLocationMode = "none" | "default" | "heading" | "course";
type TrackUserLocationChangeEvent = {
    trackUserLocation: UnsafeMixed<Exclude<NativeTrackUserLocationMode, "none"> | null>;
};
export interface NativeProps extends ViewProps {
    stop?: NativeCameraStop;
    initialViewState?: NativeViewState;
    minZoom?: CodegenTypes.WithDefault<CodegenTypes.Double, -1>;
    maxZoom?: CodegenTypes.WithDefault<CodegenTypes.Double, -1>;
    maxBounds?: CodegenTypes.Double[];
    trackUserLocation?: CodegenTypes.WithDefault<NativeTrackUserLocationMode, "none">;
    onTrackUserLocationChange?: CodegenTypes.DirectEventHandler<TrackUserLocationChangeEvent>;
}
declare const _default: HostComponent<NativeProps>;
export default _default;
//# sourceMappingURL=CameraNativeComponent.d.ts.map