"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.convertToInternalStyle = convertToInternalStyle;
exports.mergeStyleProps = mergeStyleProps;
/**
 * Converts a kebab-case string to camelCase.
 *
 * @example
 * kebabToCamel('fill-color') // Returns: 'fillColor'
 * kebabToCamel('line-gap-width') // Returns: 'lineGapWidth'
 */
function kebabToCamel(str) {
  return str.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

/**
 * Converts style spec compliant paint/layout objects (kebab-case) to internal
 * style format (camelCase).
 *
 * @example
 * convertToInternalStyle({ 'fill-color': 'red' })
 * // Returns: { fillColor: 'red' }
 */
function convertToInternalStyle(specStyle) {
  if (!specStyle) {
    return undefined;
  }
  const result = {};
  for (const key of Object.keys(specStyle)) {
    result[kebabToCamel(key)] = specStyle[key];
  }
  return result;
}

/**
 * Merges paint and layout props into a single internal style object. Priority
 * order (highest to lowest): paint > layout > style (deprecated)
 */
function mergeStyleProps(paint, layout, deprecatedStyle) {
  const convertedPaint = convertToInternalStyle(paint);
  const convertedLayout = convertToInternalStyle(layout);

  // If nothing provided, return undefined
  if (!convertedPaint && !convertedLayout && !deprecatedStyle) {
    return undefined;
  }

  // Merge: deprecated style has lowest precedence
  return {
    ...deprecatedStyle,
    ...convertedLayout,
    ...convertedPaint
  };
}
//# sourceMappingURL=convertStyleSpec.js.map