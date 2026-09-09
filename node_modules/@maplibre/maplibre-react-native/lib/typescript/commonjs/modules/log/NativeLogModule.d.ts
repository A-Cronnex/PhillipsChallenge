import type { TurboModule, CodegenTypes } from "react-native";
type NativeLogLevel = "error" | "warn" | "info" | "debug" | "verbose";
export interface Spec extends TurboModule {
    setLogLevel(logLevel: NativeLogLevel): void;
    readonly onLog: CodegenTypes.EventEmitter<{
        level: NativeLogLevel;
        tag: string;
        message: string;
    }>;
}
declare const _default: Spec;
export default _default;
//# sourceMappingURL=NativeLogModule.d.ts.map