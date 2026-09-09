"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformStyle = transformStyle;
var _reactNative = require("react-native");
var _BridgeValue = require("./BridgeValue.js");
var _getStylePropertyType = require("./getStylePropertyType.js");
function transformStyle(style) {
  if (!style) {
    return undefined;
  }
  const nativeStyle = {};
  const styleProps = Object.keys(style);
  for (const styleProp of styleProps) {
    const styleType = (0, _getStylePropertyType.getStylePropertyType)(styleProp);
    let rawStyle = style[styleProp];
    if (styleType === "color" && typeof rawStyle === "string") {
      const color = (0, _reactNative.processColor)(rawStyle);
      if (color === null || color === undefined || typeof color === "symbol") {
        console.error(`@maplibre/maplibre-react-native: Invalid color value ${rawStyle}, using #ff0000 (red) instead`);
        rawStyle = "ff0000";
      } else {
        rawStyle = color;
      }
    } else if (styleType === "image" && typeof rawStyle === "number") {
      rawStyle = _reactNative.Image.resolveAssetSource(rawStyle) || {};
    }
    const bridgeValue = new _BridgeValue.BridgeValue(rawStyle);
    nativeStyle[styleProp] = {
      styletype: styleType,
      stylevalue: bridgeValue.toJSON()
    };
  }
  return nativeStyle;
}
//# sourceMappingURL=StyleValue.js.map