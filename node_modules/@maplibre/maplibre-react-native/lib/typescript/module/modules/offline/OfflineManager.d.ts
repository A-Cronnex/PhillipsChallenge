import { OfflinePack, type OfflinePackStatus } from "./OfflinePack";
import type { LngLatBounds } from "../../types/LngLatBounds";
export interface OfflinePackCreateOptions {
    mapStyle: string;
    bounds: LngLatBounds;
    minZoom?: number;
    maxZoom?: number;
    /**
     * User-provided metadata object.
     */
    metadata?: Record<string, unknown>;
}
/**
 * Represents the offline pack download state
 */
export type OfflinePackDownloadState = "inactive" | "active" | "complete";
export type OfflinePackError = {
    id: string;
    message: string;
};
export type OfflinePackProgressListener = (offlinePack: OfflinePack, status: OfflinePackStatus) => void;
export type OfflinePackErrorListener = (offlinePack: OfflinePack, error: OfflinePackError) => void;
/**
 * OfflineManager implements a singleton (shared object) that manages offline
 * packs. All of this class's instance methods are asynchronous, reflecting the
 * fact that offline resources are stored in a database. The shared object
 * maintains a canonical collection of offline packs.
 */
declare class OfflineManager {
    private initialized;
    private readonly offlinePacks;
    private readonly progressListeners;
    private readonly errorListeners;
    private subscriptionProgress;
    private subscriptionError;
    constructor();
    /**
     * Creates and registers an offline pack that downloads the resources needed to
     * use the given region offline.
     *
     * @param options - Create options for offline pack that specifies zoom levels, style url, and
     *   the region to download.
     * @param progressListener - Callback that listens for status events while downloading the offline
     *   resource.
     * @param errorListener - Callback that listens for status events while downloading the offline
     *   resource.
     * @returns The created offline pack with its generated ID.
     *
     * @example
     * ```ts
     * const progressListener = (offlineRegion, status) =>
     *   console.log(offlineRegion, status);
     * const errorListener = (offlineRegion, error) =>
     *   console.log(offlineRegion, error);
     *
     * const offlinePack = await OfflineManager.createPack(
     *   {
     *     mapStyle: "https://demotiles.maplibre.org/tiles/tiles.json",
     *     minZoom: 14,
     *     maxZoom: 20,
     *     bounds: [west, south, east, north],
     *     metadata: { customValue: "myValue" },
     *   },
     *   progressListener,
     *   errorListener,
     * );
     * ```
     */
    createPack(options: OfflinePackCreateOptions, progressListener: OfflinePackProgressListener, errorListener: OfflinePackErrorListener): Promise<OfflinePack>;
    /**
     * Invalidates the specified offline pack. This method checks that the tiles in
     * the specified offline pack match those from the server. Local tiles that do
     * not match the latest version on the server are updated.
     *
     * This is more efficient than deleting the offline pack and downloading it
     * again. If the data stored locally matches that on the server, new data will
     * not be downloaded.
     *
     * @param id - ID of the OfflinePack.
     *
     * @example
     * ```ts
     * await OfflineManager.invalidatePack(pack.id);
     * ```
     */
    invalidatePack(id: string): Promise<void>;
    /**
     * Unregisters the given OfflinePack and allows resources that are no longer
     * required by any remaining packs to be potentially freed.
     *
     * @param id - ID of the OfflinePack.
     *
     * @example
     * ```ts
     * await OfflineManager.deletePack(pack.id);
     * ```
     */
    deletePack(id: string): Promise<void>;
    /**
     * Forces a revalidation of the tiles in the ambient cache and downloads a fresh
     * version of the tiles from the tile server. This is the recommend method for
     * clearing the cache. This is the most efficient method because tiles in the
     * ambient cache are re-downloaded to remove outdated data from a device. It
     * does not erase resources from the ambient cache or delete the database, which
     * can be computationally expensive operations that may carry unintended side
     * effects.
     *
     * @example
     * ```ts
     * await OfflineManager.invalidateAmbientCache();
     * ```
     */
    invalidateAmbientCache(): Promise<void>;
    /**
     * Erases resources from the ambient cache. This method clears the cache and
     * decreases the amount of space that map resources take up on the device.
     *
     * @example
     * ```ts
     * await OfflineManager.clearAmbientCache();
     * ```
     */
    clearAmbientCache(): Promise<void>;
    /**
     * Sets the maximum size of the ambient cache in bytes. Disables the ambient
     * cache if set to 0. This method may be computationally expensive because it
     * will erase resources from the ambient cache if its size is decreased.
     *
     * @param size - Size of ambient cache.
     *
     * @example
     * await OfflineManager.setMaximumAmbientCacheSize(5000000);
     */
    setMaximumAmbientCacheSize(size: number): Promise<void>;
    /**
     * Deletes the existing database, which includes both the ambient cache and
     * offline packs, then reinitializes it.
     *
     * @example
     * ```ts
     * await OfflineManager.resetDatabase();
     * ```
     */
    resetDatabase(): Promise<void>;
    /**
     * Retrieves all the current offline packs that are stored in the database.
     *
     * @example
     * const offlinePacks = await OfflineManager.getPacks();
     */
    getPacks(): Promise<OfflinePack[]>;
    /**
     * Retrieves an offline pack that is stored in the database by ID.
     *
     * @example
     * ```ts
     * const offlinePack = await OfflineManager.getPack(offlinePack.id);
     * ```
     */
    getPack(id: string): Promise<OfflinePack>;
    /**
     * Sideloads offline db
     *
     * @param path - Path to offline tile db on file system.
     *
     * @example
     * ```ts
     * await OfflineManager.mergeOfflineRegions(path);
     * ```
     */
    mergeOfflineRegions(path: string): Promise<void>;
    /**
     * Sets the maximum number of tiles that may be downloaded and stored on the
     * current device. Consult the Terms of Service for your map tile host before
     * changing this value.
     *
     * @param limit - Map tile limit count.
     *
     * @example
     * ```ts
     * OfflineManager.setTileCountLimit(1000);
     * ```
     */
    setTileCountLimit(limit: number): void;
    /**
     * Sets the period at which download status events will be sent over the React
     * Native bridge. The default is 500ms.
     *
     * @param throttleValue - Event throttle value in ms.
     *
     * @example
     * ```ts
     * OfflineManager.setProgressEventThrottle(500);
     * ```
     */
    setProgressEventThrottle(throttleValue: number): void;
    /**
     * Subscribe to download status/error events for the requested offline pack.
     * Note that createPack calls this internally if listeners are provided.
     *
     * @param id - ID of the offline pack.
     * @param progressListener - Callback that listens for status events while downloading the offline
     *   resource.
     * @param errorListener - Callback that listens for status events while downloading the offline
     *   resource.
     *
     * @example
     * ```ts
     * const progressListener = (offlinePack, status) =>
     *   console.log(offlinePack, status);
     * const errorListener = (offlinePack, error) => console.log(offlinePack, error);
     * OfflineManager.addListener(pack.id, progressListener, errorListener);
     * ```
     */
    addListener(id: string, progressListener: OfflinePackProgressListener, errorListener: OfflinePackErrorListener): Promise<void>;
    /**
     * Unsubscribes any listeners associated with the offline pack. Should be called
     * when the component unmounts.
     *
     * @param packId - ID of the offline pack.
     *
     * @example
     * ```ts
     * useEffect(() => {
     *   return () => {
     *     OfflineManager.removeListener(pack.id);
     *   };
     * }, []);
     * ```
     */
    removeListener(packId: string): void;
    private initialize;
    private handleProgress;
    private onError;
}
declare const offlineManager: OfflineManager;
export { offlineManager as OfflineManager };
//# sourceMappingURL=OfflineManager.d.ts.map