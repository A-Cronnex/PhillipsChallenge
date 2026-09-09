import { type ReactNode } from "react";
export interface UserLocationProps {
    /**
     * Children to render inside the UserLocation Annotation, e.g. CircleLayer,
     * SymbolLayer
     */
    children?: ReactNode;
    /**
     * Whether the UserLocation Annotation is animated between updates
     */
    animated?: boolean;
    /**
     * Render a circle which indicates the accuracy of the location
     */
    accuracy?: boolean;
    /**
     * Render an arrow which indicates direction the device is pointing relative to
     * north
     */
    heading?: boolean;
    /**
     * Minimum delta in meters for location updates
     */
    minDisplacement?: number;
    /**
     * Event triggered on pressing the UserLocation Annotation
     */
    onPress?: () => void;
}
export declare const UserLocation: import("react").MemoExoticComponent<({ animated, accuracy, heading, minDisplacement, children, onPress, }: UserLocationProps) => import("react/jsx-runtime").JSX.Element | null>;
//# sourceMappingURL=UserLocation.d.ts.map