import { type CodegenTypes, type TurboModule } from "react-native";
export interface Spec extends TurboModule {
    getData: (reactTag: CodegenTypes.Int32, filter?: any[]) => Promise<GeoJSON.FeatureCollection>;
    getClusterExpansionZoom: (reactTag: CodegenTypes.Int32, clusterId: CodegenTypes.Int32) => Promise<number>;
    getClusterLeaves: (reactTag: CodegenTypes.Int32, clusterId: CodegenTypes.Int32, limit: CodegenTypes.Int32, offset: CodegenTypes.Int32) => Promise<GeoJSON.Feature[]>;
    getClusterChildren: (reactTag: CodegenTypes.Int32, clusterId: CodegenTypes.Int32) => Promise<GeoJSON.Feature[]>;
}
declare const _default: Spec;
export default _default;
//# sourceMappingURL=NativeGeoJSONSourceModule.d.ts.map