import { type NativeOfflinePack } from "./NativeOfflineModule";
import type { OfflinePackDownloadState } from "./OfflineManager";
import type { LngLatBounds } from "../../types/LngLatBounds";
export type OfflinePackStatus = {
    id: string;
    state: OfflinePackDownloadState;
    percentage: number;
    completedResourceCount: number;
    completedResourceSize: number;
    completedTileCount: number;
    completedTileSize: number;
    requiredResourceCount: number;
};
export declare class OfflinePack {
    /** Unique Identifier (UUID), auto-generated natively during creation. */
    id: string;
    /** User-provided metadata object. */
    metadata: Record<string, unknown>;
    bounds: LngLatBounds;
    constructor(pack: NativeOfflinePack);
    status(): Promise<OfflinePackStatus>;
    resume(): Promise<void>;
    pause(): Promise<void>;
}
//# sourceMappingURL=OfflinePack.d.ts.map