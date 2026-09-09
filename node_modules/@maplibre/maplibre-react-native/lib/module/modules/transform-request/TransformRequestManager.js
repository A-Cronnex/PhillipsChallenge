"use strict";

import NativeTransformRequestModule from "./NativeTransformRequestModule.js";

/**
 * A serializable transform for rewriting MapLibre request URLs.
 *
 * Transforms are applied as a pipeline in the order they were added: transform
 * N+1 sees the URL *after* transform N has possibly changed it.
 */

/**
 * A URL query parameter to append to matching map resource requests.
 */

/**
 * A HTTP header to send with matching map resource requests.
 */

/**
 * TransformRequestManager provides methods for managing HTTP requests made by
 * MapLibre.
 *
 * Transformations are possible in three ways:
 *
 * - Transforming the URL with search and replace
 * - Adding URL search params
 * - Adding HTTP headers
 *
 * Transforms are applied in this order. The `match` conditions are applied to
 * possibly already transformed URLs.
 *
 * To gain insight into which transforms are applied set the log level to
 * `"debug"` via {@link LogManager}:
 *
 * ```ts
 * LogManager.setLogLevel("debug");
 * ```
 */
class TransformRequestManager {
  /**
   * Adds or updates a URL transform identified by `id`.
   *
   * Transforms execute in insertion order. Therefore `match` and `find` regexes
   * are matched against possibly already modified URL by previous transforms.
   *
   * Re-adding an existing `id` updates the transform **in-place**, preserving its
   * position in the pipeline. This makes it safe to refresh tokens or swap
   * domains without disrupting the order of other transforms.
   *
   * URL transforms are applied before `addUrlSearchParam` and `addHeader`.
   *
   * @param options - The transform. Set {@link TransformOptions.id} to a stable string to enable
   *   in-place updates; if omitted an id is auto-generated and returned.
   * @returns The id of the transform (the value of `transform.id` when provided, otherwise the auto-generated one). Pass it to {@link removeUrlTransform} to remove it later.
   *
   * @example Upgrade all requests to HTTPS
   * ```ts
   * TransformRequestManager.addUrlTransform({
   *   id: "force-https",
   *   find: "^http://",
   *   replace: "https://",
   * });
   * ```
   *
   * @example Redirect a specific domain through a proxy
   * ```ts
   * TransformRequestManager.addUrlTransform({
   *   id: "proxy",
   *   match: "tiles\\.example\\.com",
   *   find: "tiles\\.example\\.com",
   *   replace: "proxy.example.com",
   * });
   * ```
   *
   * @example Inject an API key into the path using a capture group
   * ```ts
   * TransformRequestManager.addUrlTransform({
   *   id: "api-key",
   *   match: "api\\.example\\.com",
   *   find: "(https://api\\.example\\.com/)(.*)",
   *   replace: "$1mySecretKey/$2",
   * });
   * ```
   */
  addUrlTransform(options) {
    const id = options.id ?? this.getId();
    NativeTransformRequestModule.addUrlTransform(id, TransformRequestManager.toRegexString(options.match), TransformRequestManager.toRegexString(options.find) ?? "", options.replace);
    return id;
  }

  /**
   * Removes the URL transform with the given `id` . No-op if the id is not
   * registered.
   *
   * @param id - The identifier passed to/returned from {@link addUrlTransform}.
   */
  removeUrlTransform(id) {
    NativeTransformRequestModule.removeUrlTransform(id);
  }

  /**
   * Removes all registered URL transforms
   */
  clearUrlTransforms() {
    NativeTransformRequestModule.clearUrlTransforms();
  }

  /**
   * Adds or updates a URL query parameter identified by `id` that will be
   * appended to all matching map resource requests. Re-adding an existing `id`
   *  updates the param in-place.
   *
   * @param options - The options. Set {@link TransformOptions.id} to a stable string to enable
   *   in-place updates; if omitted an id is auto-generated and returned.
   * @returns The id of the options. Pass it to {@link removeUrlSearchParam} to remove it later.
   *
   * @example Add apiKey to for a specific domain
   * ```ts
   * TransformRequestManager.addUrlSearchParam({
   *   match: /tiles\.example\.com/,
   *   name: "apiKey",
   *   value: "your-api-key",
   * });
   * ```
   *
   * @example Add apiKey to all requests (no match = applies to all)
   * ```ts
   * TransformRequestManager.addUrlSearchParam({
   *   name: "apiKey",
   *   value: "your-api-key",
   * });
   * ```
   */
  addUrlSearchParam(options) {
    const id = options.id ?? this.getId();
    NativeTransformRequestModule.addUrlSearchParam(id, TransformRequestManager.toRegexString(options.match), options.name, options.value);
    return id;
  }

  /**
   * Removes a previously added URL query parameter by its `id`.
   *
   * @param id - The identifier passed to/returned from {@link addUrlSearchParam}.
   */
  removeUrlSearchParam(id) {
    NativeTransformRequestModule.removeUrlSearchParam(id);
  }

  /**
   * Adds or updates an HTTP header identified by `id` that will be sent with all
   * matching map resource requests. Re-adding an existing `id` updates the header
   * in-place.
   *
   * @param options - The options. Set {@link TransformOptions.id} to a stable string to enable
   *   in-place updates; if omitted an id is auto-generated and returned.
   * @returns The id of the options. Pass it to {@link removeHeader} to remove it later.
   *
   * @example Add header to all requests
   * ```
   * TransformRequestManager.addHeader({ name: "Authorization", value: "Bearer token123" });
   * ```
   *
   * @example Add header only to requests matching a pattern
   * ```ts
   * TransformRequestManager.addHeader({
   *   name: "X-API-Key",
   *   value: "key123",
   *   match: /https:\/\/api\.example\.com\/tiles\//,
   * });
   * ```
   */
  addHeader(options) {
    const id = options.id ?? this.getId();
    NativeTransformRequestModule.addHeader(id, TransformRequestManager.toRegexString(options.match), options.name, options.value);
    return id;
  }

  /**
   * Removes all registered URL search params.
   */
  clearUrlSearchParams() {
    NativeTransformRequestModule.clearUrlSearchParams();
  }

  /**
   * Removes a previously added HTTP header by its `id`.
   *
   * @param id - The identifier passed to/returned from {@link addHeader}.
   */
  removeHeader(id) {
    NativeTransformRequestModule.removeHeader(id);
  }

  /**
   * Removes all registered HTTP headers.
   */
  clearHeaders() {
    NativeTransformRequestModule.clearHeaders();
  }

  /**
   * Removes all registered URL transforms, URL search params and HTTP headers.
   */
  clear() {
    this.clearUrlTransforms();
    this.clearUrlSearchParams();
    this.clearHeaders();
  }
  lastId = -1;
  getId() {
    this.lastId++;
    return "transform-request-" + this.lastId;
  }
  static toRegexString(value) {
    let result = undefined;
    if (value instanceof RegExp) {
      if (value.flags) {
        throw new Error("Regex flags are not supported");
      }
      result = value.source;
    } else {
      result = value;
    }
    return result || null;
  }
}
const transformRequestManager = new TransformRequestManager();
export { transformRequestManager as TransformRequestManager };
//# sourceMappingURL=TransformRequestManager.js.map