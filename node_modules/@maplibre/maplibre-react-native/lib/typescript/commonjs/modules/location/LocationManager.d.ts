interface GeolocationCoordinates {
    /**
     * Longitude in degrees
     */
    longitude: number;
    /**
     * Latitude in degrees
     */
    latitude: number;
    /**
     * Accuracy for longitude/latitude in meters
     */
    accuracy: number;
    /**
     * Altitude in meters
     */
    altitude: number | null;
    /**
     * Accuracy for altitude in meters
     */
    altitudeAccuracy: number | null;
    /**
     * Direction in which the device is traveling in degrees, relative to north
     */
    heading: number | null;
    /**
     * Instantaneous speed of the device in meters per second
     */
    speed: number | null;
}
export interface GeolocationPosition {
    coords: GeolocationCoordinates;
    timestamp: number;
}
declare class LocationManager {
    private listeners;
    private currentPosition;
    private isListening;
    private subscription;
    constructor();
    getCurrentPosition(): Promise<GeolocationPosition | undefined>;
    addListener(newListener: (location: GeolocationPosition) => void): void;
    removeListener(oldListener: (location: GeolocationPosition) => void): void;
    removeAllListeners(): void;
    start(): void;
    stop(): void;
    setMinDisplacement(minDisplacement: number): void;
    private handleUpdate;
    /**
     * Request location permissions
     *
     * Requests the following:
     * - Android: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`
     * - iOS: `requestWhenInUseAuthorization`
     *
     * @returns Promise resolves to true if permissions were granted, false otherwise
     */
    requestPermissions(): Promise<boolean>;
}
declare const locationManager: LocationManager;
export { locationManager as LocationManager };
//# sourceMappingURL=LocationManager.d.ts.map