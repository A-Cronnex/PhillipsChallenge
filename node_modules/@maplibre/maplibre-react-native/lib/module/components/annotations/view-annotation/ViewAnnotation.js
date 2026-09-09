"use strict";

import { Children, isValidElement, useImperativeHandle, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import PointAnnotationNativeComponent, { Commands } from "./PointAnnotationNativeComponent";
import { useFrozenId } from "../../../hooks/useFrozenId.js";
import { anchorToNative } from "../../../types/Anchor.js";
import { Callout } from "../callout/Callout.js";
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    position: "absolute"
  }
});

/**
 * Event emitted by a ViewAnnotation on press.
 */

/**
 * ViewAnnotation represents a one-dimensional shape located at a single
 * geographical coordinate.
 *
 * Consider using GeoJSONSource and SymbolLayer instead, if you have many
 * points, and you have static images, they'll offer much better performance.
 *
 * If you need interactive views please use Marker, as with ViewAnnotation on
 * Android child views are rendered onto a bitmap for better performance.
 */
export const ViewAnnotation = ({
  id,
  anchor = "center",
  draggable = false,
  offset,
  ref,
  ...props
}) => {
  const frozenId = useFrozenId(id);
  const nativeAnchor = anchorToNative(anchor);
  const nativeOffset = offset ? {
    x: offset[0],
    y: offset[1]
  } : undefined;
  const nativeRef = useRef(null);
  useImperativeHandle(ref, () => ({
    refresh: () => {
      if (Platform.OS === "android" && nativeRef.current) {
        Commands.refresh(nativeRef.current);
      }
    },
    getAnimatableRef: () => nativeRef.current ? new Proxy(nativeRef.current, {
      get: (target, prop) => prop === "_viewConfig" ? target.__viewConfig : target[prop]
    }) : null
  }));
  const wrappedChildren = (() => {
    if (Platform.OS !== "android") {
      return props.children;
    }

    // Separate Callout from other children so native can identify it
    const childArray = Children.toArray(props.children);
    const callout = childArray.find(child => /*#__PURE__*/isValidElement(child) && child.type === Callout);
    const otherChildren = childArray.filter(child => ! /*#__PURE__*/isValidElement(child) || child.type !== Callout);
    return /*#__PURE__*/_jsxs(_Fragment, {
      children: [/*#__PURE__*/_jsx(View, {
        collapsable: false,
        style: {
          overflow: "visible"
        },
        children: otherChildren
      }), callout]
    });
  })();
  return /*#__PURE__*/_jsx(PointAnnotationNativeComponent, {
    ref: nativeRef,
    ...props,
    id: frozenId,
    anchor: nativeAnchor,
    offset: nativeOffset,
    draggable: draggable,
    style: [props.style, styles.container],
    children: wrappedChildren
  });
};
//# sourceMappingURL=ViewAnnotation.js.map