import { Component, type MutableRefObject, type SyntheticEvent } from "react";
import { type NativeArg } from "../utils";
export type RNMLEvent<PayloadType = {
    [key: string]: string;
}> = {
    payload: PayloadType;
    type: string;
};
type UseNativeBridge = {
    _nativeModuleName: string;
    _onAndroidCallback: (e: SyntheticEvent<Element, RNMLEvent>) => void;
    _callbackMap: MutableRefObject<Map<string, any>>;
    _preRefMapMethodQueue: MutableRefObject<any[]>;
    _addAddAndroidCallback: <ReturnType>(id: string, resolve: (value: ReturnType) => void, reject: (error: Error) => void) => void;
    _removeAndroidCallback: (id: string) => void;
    _runPendingNativeCommands: <RefType extends Component>(nativeRef: RefType | null | undefined) => Promise<void>;
    _runNativeCommand: <RefType extends Component, ReturnType = NativeArg>(methodName: string, nativeRef: RefType | undefined | null, args?: NativeArg[]) => Promise<ReturnType>;
};
export declare const useNativeBridge: (moduleName: string) => UseNativeBridge;
export {};
//# sourceMappingURL=useNativeBridge.d.ts.map