"use strict";

import { Children } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import CalloutNativeComponent from "./CalloutNativeComponent";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const styles = StyleSheet.create({
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
export const Callout = ({
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
  const calloutContent = Children.count(children) > 0 ? /*#__PURE__*/_jsx(Animated.View, {
    testID: testID ? `${testID}-animated` : undefined,
    style: animatedStyle,
    ...props,
    children: children
  }) : /*#__PURE__*/_jsxs(Animated.View, {
    testID: testID ? `${testID}-animated` : undefined,
    style: [styles.animated, animatedStyle],
    ...props,
    children: [/*#__PURE__*/_jsx(View, {
      testID: testID ? `${testID}-content` : undefined,
      style: [styles.content, contentStyle],
      children: /*#__PURE__*/_jsx(Text, {
        testID: testID ? `${testID}-title` : undefined,
        style: [styles.title, titleStyle],
        children: title
      })
    }), /*#__PURE__*/_jsx(View, {
      testID: testID ? `${testID}-tip` : undefined,
      style: [styles.tip, tipStyle]
    })]
  });
  return /*#__PURE__*/_jsx(CalloutNativeComponent, {
    testID: testID,
    style: [{
      position: "absolute",
      zIndex: 999,
      backgroundColor: "transparent"
    }, style],
    children: calloutContent
  });
};
//# sourceMappingURL=Callout.js.map