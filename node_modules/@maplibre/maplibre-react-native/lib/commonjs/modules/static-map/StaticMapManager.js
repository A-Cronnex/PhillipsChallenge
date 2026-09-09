"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.StaticMapImageManager = void 0;
var _NativeStaticMapModule = _interopRequireDefault(require("./NativeStaticMapModule.js"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
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
    return _NativeStaticMapModule.default.createImage({
      mapStyle: typeof mapStyle === "string" ? mapStyle : JSON.stringify(mapStyle),
      ...options
    });
  }
}
const staticMapImageManager = exports.StaticMapImageManager = new StaticMapManager();
//# sourceMappingURL=StaticMapManager.js.map