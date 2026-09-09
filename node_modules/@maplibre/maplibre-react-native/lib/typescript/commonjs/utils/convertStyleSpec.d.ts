import type { AllLayerStyle } from "../types/MapLibreRNStyles";
/**
 * Converts style spec compliant paint/layout objects (kebab-case) to internal
 * style format (camelCase).
 *
 * @example
 * convertToInternalStyle({ 'fill-color': 'red' })
 * // Returns: { fillColor: 'red' }
 */
export declare function convertToInternalStyle(specStyle: Record<string, unknown> | undefined): Partial<AllLayerStyle> | undefined;
/**
 * Merges paint and layout props into a single internal style object. Priority
 * order (highest to lowest): paint > layout > style (deprecated)
 */
export declare function mergeStyleProps(paint: Record<string, unknown> | undefined, layout: Record<string, unknown> | undefined, deprecatedStyle: AllLayerStyle | undefined): AllLayerStyle | undefined;
//# sourceMappingURL=convertStyleSpec.d.ts.map