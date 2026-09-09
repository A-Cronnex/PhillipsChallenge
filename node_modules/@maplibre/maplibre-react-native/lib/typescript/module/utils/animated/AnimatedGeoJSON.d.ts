import type { AnimatedCoordinatesArray } from "./AnimatedCoordinatesArray";
import { AnimatedExtractCoordinateFromArray } from "./AnimatedExtractCoordinateFromArray";
import { AnimatedRouteCoordinatesArray } from "./AnimatedRouteCoordinatesArray";
declare const AnimatedWithChildren: any;
type AnimatedGeoJSONValueIn = {
    type: "Point";
    coordinates: AnimatedExtractCoordinateFromArray;
} | {
    type: "LineString";
    coordinates: AnimatedCoordinatesArray | AnimatedRouteCoordinatesArray;
};
/**
 * AnimatedGeoJSON can be used to have animated properties inside the data
 * property
 *
 * Equivalent of AnimatedStyle for GeoJSON
 * https://github.com/facebook/react-native/blob/main/packages/react-native/Libraries/Animated/nodes/AnimatedStyle.js
 *
 * @example
 * <AnimatedGeoJSONSource ... data={new AnimatedGeoJSON({type:'LineString', coordinates: animatedCoords})} />
 */
export declare class AnimatedGeoJSON extends AnimatedWithChildren {
    constructor(valueIn: AnimatedGeoJSONValueIn);
    private walkGeoJSONAndGetValues;
    private walkAndProcess;
    __getValue(): GeoJSON.Point | GeoJSON.LineString;
    __attach(): void;
    __detach(): void;
}
export {};
//# sourceMappingURL=AnimatedGeoJSON.d.ts.map