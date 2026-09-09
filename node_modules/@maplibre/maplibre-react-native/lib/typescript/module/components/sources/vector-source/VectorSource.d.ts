import type { FilterSpecification } from "@maplibre/maplibre-gl-style-spec";
import { type ReactNode, type Ref } from "react";
import { type BaseProps } from "../../../types/BaseProps";
import type { PressableSourceProps } from "../../../types/PressableSourceProps";
export interface VectorSourceRef {
    /**
     * Returns all features that match the query parameters regardless of whether
     * the feature is currently rendered on the map. The domain of the query
     * includes all currently-loaded vector tiles and GeoJSON source tiles. This
     * function does not check tiles outside the visible viewport.
     *
     * @example
     * ```ts
     * vectorSource.querySourceFeatures({ sourceLayer: "some-source-layer" });
     * ```
     */
    querySourceFeatures(options: {
        sourceLayer: string;
        filter?: FilterSpecification;
    }): Promise<GeoJSON.Feature[]>;
}
export interface VectorSourceProps extends BaseProps, PressableSourceProps {
    /**
     * A string that uniquely identifies the source.
     */
    id?: string;
    /**
     * A URL to a TileJSON configuration file describing the source’s contents and
     * other metadata.
     */
    url?: string;
    /**
     * An array of tile URL templates. If multiple endpoints are specified, clients
     * may use any combination of endpoints. Common format should be:
     * `https://example.com/vector-tiles/{z}/{x}/{y}.pbf` .
     */
    tiles?: string[];
    /**
     * An unsigned integer that specifies the minimum zoom level at which to display
     * tiles from the source. The value should be between 0 and 22, inclusive, and
     * less than maxzoom, if specified. The default value for this option is 0.
     */
    minzoom?: number;
    /**
     * An unsigned integer that specifies the maximum zoom level at which to display
     * tiles from the source. The value should be between 0 and 22, inclusive, and
     * less than minzoom, if specified. The default value for this option is 22.
     */
    maxzoom?: number;
    /**
     * Influences the y direction of the tile coordinates. (tms inverts y-axis)
     *
     * @defaultValue "xyz"
     */
    scheme?: "xyz" | "tms";
    /**
     * An HTML or literal text string defining the buttons to be displayed in an
     * action sheet when the source is part of a map view’s style and the map view’s
     * attribution button is pressed.
     */
    attribution?: string;
    children?: ReactNode;
    /**
     * Ref to access VectorSource methods.
     */
    ref?: Ref<VectorSourceRef>;
}
/**
 * VectorSource is a map content source that supplies tiled vector data in
 * Mapbox Vector Tile format to be shown on the map. The location of and
 * metadata about the tiles are defined either by an option dictionary or by an
 * external file that conforms to the TileJSON specification.
 */
export declare const VectorSource: import("react").MemoExoticComponent<({ id, ref, ...props }: VectorSourceProps) => import("react/jsx-runtime").JSX.Element>;
//# sourceMappingURL=VectorSource.d.ts.map