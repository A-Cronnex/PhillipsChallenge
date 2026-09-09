import { Animated } from "react-native";
type AnimatedPointValueIn = GeoJSON.Point | {
    type: "Point";
    coordinates: Animated.AnimatedValue[];
};
declare const AnimatedWithChildren: typeof Animated.AnimatedWithChildren;
export declare class AnimatedPoint extends AnimatedWithChildren {
    longitude: Animated.Value;
    latitude: Animated.Value;
    _lngLatListeners: Record<string, {
        longitude: string;
        latitude: string;
    }>;
    constructor(valueIn?: AnimatedPointValueIn);
    setValue(value: GeoJSON.Point): void;
    setOffset(offset: GeoJSON.Point): void;
    flattenOffset(): void;
    stopAnimation(callback?: (value: GeoJSON.Point) => void): void;
    addListener(callback?: (value: GeoJSON.Point) => void): string;
    removeListener(id: string): void;
    spring({ toValue, ...config }: Omit<Animated.SpringAnimationConfig, "useNativeDriver" | "toValue"> & {
        toValue: GeoJSON.Point;
    }): Animated.CompositeAnimation;
    timing({ toValue, ...config }: Omit<Animated.TimingAnimationConfig, "useNativeDriver" | "toValue"> & {
        toValue: GeoJSON.Point;
    }): Animated.CompositeAnimation;
    __getValue(): GeoJSON.Point;
    __attach(): void;
    __detach(): void;
}
export {};
//# sourceMappingURL=AnimatedPoint.d.ts.map