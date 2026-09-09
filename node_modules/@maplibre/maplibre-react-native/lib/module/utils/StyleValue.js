"use strict";

import { Image, processColor } from "react-native";
import { BridgeValue } from "./BridgeValue.js";
import { getStylePropertyType } from "./getStylePropertyType.js";
export function transformStyle(style) {
  if (!style) {
    return undefined;
  }
  const nativeStyle = {};
  const styleProps = Object.keys(style);
  for (const styleProp of styleProps) {
    const styleType = getStylePropertyType(styleProp);
    let rawStyle = style[styleProp];
    if (styleType === "color" && typeof rawStyle === "string") {
      const color = processColor(rawStyle);
      if (color === null || color === undefined || typeof color === "symbol") {
        console.error(`@maplibre/maplibre-react-native: Invalid color value ${rawStyle}, using #ff0000 (red) instead`);
        rawStyle = "ff0000";
      } else {
        rawStyle = color;
      }
    } else if (styleType === "image" && typeof rawStyle === "number") {
      rawStyle = Image.resolveAssetSource(rawStyle) || {};
    }
    const bridgeValue = new BridgeValue(rawStyle);
    nativeStyle[styleProp] = {
      styletype: styleType,
      stylevalue: bridgeValue.toJSON()
    };
  }
  return nativeStyle;
}
//# sourceMappingURL=StyleValue.js.map