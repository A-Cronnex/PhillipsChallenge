import { type CodegenTypes, type HostComponent, type ViewProps } from "react-native";
import type { UnsafeMixed } from "../../../types/codegen/UnsafeMixed";
export interface NativeProps extends ViewProps {
    id: string;
    url?: string;
    coordinates?: UnsafeMixed<[
        topLeft: [longitude: CodegenTypes.Double, latitude: CodegenTypes.Double],
        topRight: [longitude: CodegenTypes.Double, latitude: CodegenTypes.Double],
        bottomRight: [
            longitude: CodegenTypes.Double,
            latitude: CodegenTypes.Double
        ],
        bottomLeft: [
            longitude: CodegenTypes.Double,
            latitude: CodegenTypes.Double
        ]
    ]>;
}
declare const _default: HostComponent<NativeProps>;
export default _default;
//# sourceMappingURL=ImageSourceNativeComponent.d.ts.map