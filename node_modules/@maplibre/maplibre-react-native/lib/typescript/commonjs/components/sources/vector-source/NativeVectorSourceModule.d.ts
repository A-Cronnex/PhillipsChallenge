import { type CodegenTypes, type TurboModule } from "react-native";
export interface Spec extends TurboModule {
    querySourceFeatures: (reactTag: CodegenTypes.Int32, sourceLayer: string, filter: string[]) => Promise<GeoJSON.Feature[]>;
}
declare const _default: Spec;
export default _default;
//# sourceMappingURL=NativeVectorSourceModule.d.ts.map