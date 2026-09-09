import { type ReactNode } from "react";
import { type BaseProps } from "../../../types/BaseProps";
import type { LngLat } from "../../../types/LngLat";
export interface ImageSourceProps extends BaseProps {
    /**
     * A string that uniquely identifies the source.
     */
    id?: string;
    /**
     * An HTTP(S) URL, absolute file URL, or local file URL to the source image.
     * Animated GIFs are not supported.
     */
    url: string | number;
    /**
     * The top left, top right, bottom right, and bottom left coordinates for the
     * image.
     */
    coordinates: [
        topLeft: LngLat,
        topRight: LngLat,
        bottomRight: LngLat,
        bottomLeft: LngLat
    ];
    children?: ReactNode;
}
/**
 * ImageSource is a content source that is used for a georeferenced raster image
 * to be shown on the map. The georeferenced image scales and rotates as the
 * user zooms and rotates the map
 */
export declare const ImageSource: import("react").MemoExoticComponent<({ id, url, ...props }: ImageSourceProps) => import("react/jsx-runtime").JSX.Element>;
//# sourceMappingURL=ImageSource.d.ts.map