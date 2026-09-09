import { type CodegenTypes, type HostComponent, type ViewProps } from "react-native";
type NativeScheme = "xyz" | "tms";
export interface NativeProps extends ViewProps {
    id: string;
    url?: string;
    tiles?: string[];
    tileSize?: CodegenTypes.WithDefault<CodegenTypes.Int32, 512>;
    minzoom?: CodegenTypes.WithDefault<CodegenTypes.Int32, -1>;
    maxzoom?: CodegenTypes.WithDefault<CodegenTypes.Int32, -1>;
    attribution?: string;
    scheme?: CodegenTypes.WithDefault<NativeScheme, "xyz">;
}
declare const _default: HostComponent<NativeProps>;
export default _default;
//# sourceMappingURL=RasterSourceNativeComponent.d.ts.map