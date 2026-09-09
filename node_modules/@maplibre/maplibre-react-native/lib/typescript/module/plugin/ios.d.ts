import { type ConfigPlugin } from "expo/config-plugins";
import type { MapLibrePluginProps } from "./MapLibrePluginProps";
/**
 * Only the post-install block is required, the post installer block is used for
 * SPM (Swift Package Manager) which Expo doesn't currently support.
 */
export declare function applyPodfilePostInstall(contents: string): string;
export declare const applyPodfileGlobalVariables: (contents: string, props: MapLibrePluginProps) => string;
export declare const withPodfileGlobalVariables: ConfigPlugin<MapLibrePluginProps>;
export declare const ios: {
    withPodfilePostInstall: ConfigPlugin;
    withPodfileGlobalVariables: ConfigPlugin<MapLibrePluginProps>;
    withDwarfDsym: ConfigPlugin;
};
//# sourceMappingURL=ios.d.ts.map