import { type CodegenTypes, type HostComponent, type ViewProps } from "react-native";
import type { UnsafeMixed } from "../../types/codegen/UnsafeMixed";
type ImageMissingEvent = {
    image: string;
};
export type NativeImageEntry = {
    uri: string;
    scale?: CodegenTypes.Double;
    sdf?: boolean;
};
export interface NativeProps extends ViewProps {
    images?: UnsafeMixed<Record<string, NativeImageEntry>>;
    onImageMissing?: CodegenTypes.DirectEventHandler<ImageMissingEvent>;
}
declare const _default: HostComponent<NativeProps>;
export default _default;
//# sourceMappingURL=ImagesNativeComponent.d.ts.map