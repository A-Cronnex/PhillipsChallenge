"use strict";

import { Animated } from "react-native";
const AnimatedWithChildren = Object.getPrototypeOf(Animated.ValueXY);
export class AnimatedExtractCoordinateFromArray extends AnimatedWithChildren {
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
//# sourceMappingURL=AnimatedExtractCoordinateFromArray.js.map