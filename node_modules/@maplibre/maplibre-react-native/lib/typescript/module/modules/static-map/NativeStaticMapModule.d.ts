import type { CodegenTypes, TurboModule } from "react-native";
interface NativeStaticMapCreateOptions {
    center?: CodegenTypes.Double[];
    zoom?: CodegenTypes.Double;
    bearing?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
    pitch?: CodegenTypes.WithDefault<CodegenTypes.Double, 0>;
    bounds?: CodegenTypes.Double[];
    mapStyle: string;
    width: CodegenTypes.Int32;
    height: CodegenTypes.Int32;
    output: "base64" | "file";
    logo?: boolean;
}
export interface Spec extends TurboModule {
    createImage(options: NativeStaticMapCreateOptions): Promise<string>;
}
declare const _default: Spec;
export default _default;
//# sourceMappingURL=NativeStaticMapModule.d.ts.map