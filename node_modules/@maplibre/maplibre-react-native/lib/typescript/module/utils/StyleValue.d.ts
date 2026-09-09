import { type StyleValueJSON } from "./BridgeValue";
import { type AllLayerStyle } from "../types/MapLibreRNStyles";
export type StyleValue = {
    styletype: string;
    stylevalue: StyleValueJSON;
};
export declare function transformStyle(style: AllLayerStyle | undefined): undefined | {
    [key: string]: StyleValue;
};
//# sourceMappingURL=StyleValue.d.ts.map