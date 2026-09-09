"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Callout = void 0;
var _react = require("react");
var _reactNative = require("react-native");
var _CalloutNativeComponent = _interopRequireDefault(require("./CalloutNativeComponent"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const styles = _reactNative.StyleSheet.create({
  animated: {
    alignItems: "center",
    justifyContent: "center",
    width: 180,
    zIndex: 9999999
  },
  content: {
    backgroundColor: "white",
    borderColor: "rgba(0, 0, 0, 0.2)",
    borderRadius: 3,
    borderWidth: 1,
    flex: 1,
    padding: 8,
    position: "relative"
  },
  tip: {
    backgroundColor: "transparent",
    borderBottomColor: "transparent",
    borderBottomWidth: 0,
    borderLeftColor: "transparent",
    borderLeftWidth: 8,
    borderRightColor: "transparent",
    borderRightWidth: 8,
    borderTopColor: "white",
    borderTopWidth: 16,
    elevation: 0,
    marginTop: -2,
    zIndex: 1000
  },
  title: {
    color: "black",
    textAlign: "center"
  }
});
/**
 * Callout that displays information about a selected annotation near the
 * annotation.
 */
const Callout = ({
  title,
  style,
  animatedStyle,
  contentStyle,
  tipStyle,
  titleStyle,
  children,
  testID,
  ...props
}) => {
  const calloutContent = _react.Children.count(children) > 0 ? /*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNative.Animated.View, {
    testID: testID ? `${testID}-animated` : undefined,
    style: animatedStyle,
    ...props,
    children: children
  }) : /*#__PURE__*/(0, _jsxRuntime.jsxs)(_reactNative.Animated.View, {
    testID: testID ? `${testID}-animated` : undefined,
    style: [styles.animated, animatedStyle],
    ...props,
    children: [/*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNative.View, {
      testID: testID ? `${testID}-content` : undefined,
      style: [styles.content, contentStyle],
      children: /*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNative.Text, {
        testID: testID ? `${testID}-title` : undefined,
        style: [styles.title, titleStyle],
        children: title
      })
    }), /*#__PURE__*/(0, _jsxRuntime.jsx)(_reactNative.View, {
      testID: testID ? `${testID}-tip` : undefined,
      style: [styles.tip, tipStyle]
    })]
  });
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_CalloutNativeComponent.default, {
    testID: testID,
    style: [{
      position: "absolute",
      zIndex: 999,
      backgroundColor: "transparent"
    }, style],
    children: calloutContent
  });
};
exports.Callout = Callout;
//# sourceMappingURL=Callout.js.map