import { type CodegenTypes, type HostComponent, type ViewProps } from "react-native";
export interface NativeProps extends ViewProps {
    mode?: CodegenTypes.WithDefault<"default" | "heading" | "course", "default">;
    androidPreferredFramesPerSecond?: CodegenTypes.WithDefault<CodegenTypes.Int32, -1>;
}
declare const _default: HostComponent<NativeProps>;
export default _default;
//# sourceMappingURL=UserLocationNativeComponent.d.ts.map