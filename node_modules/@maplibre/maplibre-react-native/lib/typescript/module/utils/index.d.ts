import { Component, type ReactElement, type ReactNode } from "react";
import { type ImageSourcePropType } from "react-native";
export declare function isAndroid(): boolean;
export declare function isFunction(fn: unknown): fn is Function;
export declare function isNumber(num: unknown): num is number;
export declare function isUndefined(obj: unknown): obj is undefined;
export declare function isString(str: unknown): str is string;
export declare function isBoolean(bool: unknown): bool is boolean;
export type NativeArg = string | number | boolean | null | {
    [k: string]: NativeArg;
} | NativeArg[];
export declare function runNativeCommand<ReturnType = NativeArg>(module: string, name: string, nativeRef: Component, args?: NativeArg[]): ReturnType;
export declare function cloneReactChildrenWithProps(children: ReactNode, propsToAdd?: {
    [key: string]: string;
}): ReactElement[] | null;
export declare function resolveImagePath(imageRef: ImageSourcePropType): string;
export declare function toJSONString(json?: object | string): string;
//# sourceMappingURL=index.d.ts.map