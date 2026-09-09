export type RawValueType = string | number | boolean | RawValueType[] | {
    [key: string]: RawValueType;
};
export type StyleValueJSON = {
    type: "boolean";
    value: boolean;
} | {
    type: "number";
    value: number;
} | {
    type: "string";
    value: string;
} | {
    type: "hashmap";
    value: object;
} | {
    type: "array";
    value: unknown[];
};
type StyleValueTypes = "boolean" | "number" | "string" | "hashmap" | "array";
export declare class BridgeValue {
    rawValue: RawValueType;
    constructor(rawValue: RawValueType);
    get type(): StyleValueTypes;
    get value(): [StyleValueJSON, StyleValueJSON][] | StyleValueJSON[] | RawValueType;
    toJSON(formatter?: <T>(arg0: T) => T): StyleValueJSON;
}
export {};
//# sourceMappingURL=BridgeValue.d.ts.map