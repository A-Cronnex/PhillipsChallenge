import { type ReactNode } from "react";
import { type NativeSyntheticEvent } from "react-native";
import type { BaseProps } from "../../types/BaseProps";
import type { LngLat } from "../../types/LngLat";
import type { PressEventWithFeatures } from "../../types/PressEventWithFeatures";
export interface LayerAnnotationProps extends BaseProps {
    id?: string;
    lngLat: LngLat;
    animated?: boolean;
    animationDuration?: number;
    animationEasingFunction?: (x: number) => number;
    onPress?: (event: NativeSyntheticEvent<PressEventWithFeatures>) => void;
    children?: ReactNode;
}
/**
 * Convenience wrapper around a GeoJSONSource for a Point/LngLat, optionally
 * animated.
 */
export declare const LayerAnnotation: ({ lngLat, animated, animationDuration, animationEasingFunction, ...props }: LayerAnnotationProps) => import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=LayerAnnotation.d.ts.map