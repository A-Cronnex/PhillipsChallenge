"use strict";

import NativeStaticMapModule from "./NativeStaticMapModule.js";
/**
 * The StaticMapManager creates static images of a map.
 */
class StaticMapManager {
  /**
   * Creates a static image of a map. Images are always in PNG format.
   *
   * @param options -
   *
   * @example Create static map with center, returning the URI to the temporary PNG file
   * ```ts
   * const uri = await StaticMapManager.createImage({
   *   center: [-74.12641, 40.797968],
   *   zoom: 12,
   *   bearing: 20,
   *   pitch: 30,
   *   mapStyle: "https://demotiles.maplibre.org/style.json",
   *   width: 128,
   *   height: 64,
   *   output: "file",
   * });
   * ```
   *
   * @example Create a static map with bounds, returning a base64 encoded PNG
   * ```ts
   * const uri = await StaticMapManager.createImage({
   *   bounds: [
   *     [-74.12641, 40.797968],
   *     [-74.143727, 40.772177],
   *   ],
   *   mapStyle: "https://demotiles.maplibre.org/style.json",
   *   width: 128,
   *   height: 64,
   *   output: "base64",
   * });
   * ```
   */
  async createImage({
    mapStyle,
    ...options
  }) {
    return NativeStaticMapModule.createImage({
      mapStyle: typeof mapStyle === "string" ? mapStyle : JSON.stringify(mapStyle),
      ...options
    });
  }
}
const staticMapImageManager = new StaticMapManager();
export { staticMapImageManager as StaticMapImageManager };
//# sourceMappingURL=StaticMapManager.js.map