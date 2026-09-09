import { type AndroidConfig, type ConfigPlugin } from "expo/config-plugins";
import type { MapLibrePluginProps } from "./MapLibrePluginProps";
type PropertiesItem = AndroidConfig.Properties.PropertiesItem;
type PropertyItem = {
    type: "property";
    key: string;
    value: string;
};
export declare const GRADLE_PROPERTIES_PREFIX = "org.maplibre.reactnative.";
export declare const getGradleProperties: (props: MapLibrePluginProps) => PropertyItem[];
export declare const mergeGradleProperties: (oldProperties: PropertiesItem[], newProperties: PropertyItem[]) => PropertiesItem[];
export declare const withGradleProperties: ConfigPlugin<MapLibrePluginProps>;
export declare const android: {
    withGradleProperties: ConfigPlugin<MapLibrePluginProps>;
};
export {};
//# sourceMappingURL=android.d.ts.map