"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AnimatedExtractCoordinateFromArray = void 0;
var _reactNative = require("react-native");
const AnimatedWithChildren = Object.getPrototypeOf(_reactNative.Animated.ValueXY);
class AnimatedExtractCoordinateFromArray extends AnimatedWithChildren {
  constructor(array, index) {
    super();
    this.array = array;
    this.index = index;
  }
  __getValue() {
    const actArray = this.array.__getValue();
    let index = this.index;
    if (index < 0) {
      index += actArray.length;
    }
    return actArray[index];
  }
  __attach() {
    this.array.__addChild(this);
  }
  __detach() {
    this.array.__removeChild(this);
    super.__detach();
  }
}
exports.AnimatedExtractCoordinateFromArray = AnimatedExtractCoordinateFromArray;
//# sourceMappingURL=AnimatedExtractCoordinateFromArray.js.map