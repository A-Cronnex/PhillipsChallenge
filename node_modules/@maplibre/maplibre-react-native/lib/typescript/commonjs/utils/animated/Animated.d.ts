import type { ComponentType } from "react";
import { Animated as RNAnimated } from "react-native";
import { AnimatedCoordinatesArray } from "./AnimatedCoordinatesArray";
import { AnimatedExtractCoordinateFromArray } from "./AnimatedExtractCoordinateFromArray";
import { AnimatedGeoJSON } from "./AnimatedGeoJSON";
import { AnimatedPoint } from "./AnimatedPoint";
import { AnimatedRouteCoordinatesArray } from "./AnimatedRouteCoordinatesArray";
export declare const Animated: {
    GeoJSONSource: RNAnimated.AnimatedComponent<ComponentType<Omit<import("../..").GeoJSONSourceProps, "data"> & {
        data: string | GeoJSON.GeoJSON | AnimatedGeoJSON;
    }>>;
    ImageSource: RNAnimated.AnimatedComponent<import("react").MemoExoticComponent<({ id, url, ...props }: import("../..").ImageSourceProps) => import("react/jsx-runtime").JSX.Element>>;
    Marker: RNAnimated.AnimatedComponent<({ id, anchor, offset, ref, ...props }: import("../..").MarkerProps) => import("react/jsx-runtime").JSX.Element>;
    Layer: RNAnimated.AnimatedComponent<({ id, ...props }: import("../..").LayerProps) => import("react/jsx-runtime").JSX.Element>;
    Point: typeof AnimatedPoint;
    CoordinatesArray: typeof AnimatedCoordinatesArray;
    RouteCoordinatesArray: typeof AnimatedRouteCoordinatesArray;
    GeoJSON: typeof AnimatedGeoJSON;
    ExtractCoordinateFromArray: typeof AnimatedExtractCoordinateFromArray;
};
//# sourceMappingURL=Animated.d.ts.map