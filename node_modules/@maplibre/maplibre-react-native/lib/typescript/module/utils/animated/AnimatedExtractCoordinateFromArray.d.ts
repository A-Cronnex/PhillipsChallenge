import type { AnimatedCoordinates } from "./AbstractAnimatedCoordinates";
import { AnimatedRouteCoordinatesArray } from "./AnimatedRouteCoordinatesArray";
declare const AnimatedWithChildren: any;
export declare class AnimatedExtractCoordinateFromArray extends AnimatedWithChildren {
    private array;
    private readonly index;
    constructor(array: AnimatedRouteCoordinatesArray, index: number);
    __getValue(): AnimatedCoordinates;
    __attach(): void;
    __detach(): void;
}
export {};
//# sourceMappingURL=AnimatedExtractCoordinateFromArray.d.ts.map