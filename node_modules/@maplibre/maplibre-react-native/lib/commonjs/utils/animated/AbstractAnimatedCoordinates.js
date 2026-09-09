"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AbstractAnimatedCoordinates = void 0;
var _reactNative = require("react-native");
const AnimatedWithChildren = Object.getPrototypeOf(_reactNative.Animated.ValueXY);
const defaultConfig = {
  useNativeDriver: false
};
class AbstractAnimatedCoordinates extends AnimatedWithChildren {
  constructor(coordinates) {
    super();
    this.state = this.onInitialState(coordinates);
  }

  /**
   * Subclasses can override to calculate initial state
   *
   * @returns the state object
   */

  /**
   * Calculates state based on startingState and progress, returns a new state
   *
   * @param state - state object from initialState and/or from calculate
   * @param progress - value between 0 and 1
   * @returns next state
   */

  /**
   * Subclasses can override getValue to calculate value from state. Value is
   * typically coordinates array, but can be anything
   *
   * @param state - either state from initialState and/or from calculate
   */

  animate(progressValue, progressAnimation, config) {
    const onAnimationStart = animation => {
      if (this.animation) {
        const actProgress = this.progressValue.__getValue();
        this.animation.stop();
        this.state = this.onCalculate(this.state, actProgress);
        this.progressValue.__removeChild(this);
        this.progressValue = null;
        this.animation = null;
      }
      this.progressValue = progressValue;
      this.progressValue.__addChild(this);
      this.animation = animation;
      this.state = this.onStart(this.state, config.toValue);
    };
    const origAnimationStart = progressAnimation.start;
    const newAnimation = progressAnimation;
    newAnimation.start = function start(...args) {
      onAnimationStart(progressAnimation);
      origAnimationStart(...args);
    };
    return newAnimation;
  }
  timing(config) {
    const progressValue = new _reactNative.Animated.Value(0.0);
    return this.animate(progressValue, _reactNative.Animated.timing(progressValue, {
      ...defaultConfig,
      ...config,
      toValue: 1.0
    }), {
      ...defaultConfig,
      ...config
    });
  }
  spring(config) {
    const progressValue = new _reactNative.Animated.Value(0.0);
    return this.animate(progressValue, _reactNative.Animated.spring(progressValue, {
      ...defaultConfig,
      ...config,
      toValue: 1.0
    }), config);
  }
  decay(config) {
    const progressValue = new _reactNative.Animated.Value(0.0);
    return this.animate(progressValue, _reactNative.Animated.decay(this.progressValue, {
      ...defaultConfig,
      ...config
    }), config);
  }
  __getValue() {
    if (!this.progressValue) {
      return this.onGetValue(this.state);
    }
    return this.onGetValue(this.onCalculate(this.state, this.progressValue.__getValue()));
  }
}
exports.AbstractAnimatedCoordinates = AbstractAnimatedCoordinates;
//# sourceMappingURL=AbstractAnimatedCoordinates.js.map