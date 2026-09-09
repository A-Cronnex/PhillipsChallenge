import { type ViewProps, type ViewStyle } from "react-native";
export interface CalloutProps extends Omit<ViewProps, "style"> {
    /**
     * String that gets displayed in the default callout.
     */
    title?: string;
    /**
     * Style property for the CalloutNativeComponent.
     *
     * Use at your own risk.
     */
    style?: ViewStyle;
    /**
     * Style property for the Animated.View wrapper, apply animations to this
     */
    animatedStyle?: ViewStyle;
    /**
     * Style property for the content bubble.
     */
    contentStyle?: ViewStyle;
    /**
     * Style property for the triangle tip under the content.
     */
    tipStyle?: ViewStyle;
    /**
     * Style property for the title in the content bubble.
     */
    titleStyle?: ViewStyle;
}
/**
 * Callout that displays information about a selected annotation near the
 * annotation.
 */
export declare const Callout: ({ title, style, animatedStyle, contentStyle, tipStyle, titleStyle, children, testID, ...props }: CalloutProps) => import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=Callout.d.ts.map